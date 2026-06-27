# Flow Trace: Record Insertion

This document traces the step-by-step path of posting and validating a new record into a structured Table.

---

## Step 1: Controller Entry
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/api/controllers/record_controller.py`
*   **Method Signature**: 
    ```python
    async def create_record(
        pod_id: UUID,
        table_name: str,
        payload: dict,
        user = Depends(get_current_user),
        record_service: RecordService = Depends(get_record_service),
        table_service: TableService = Depends(get_table_service)
    ) -> dict
    ```
*   **Details**: Captures the target table, routes the payload, and builds the database/table context.

---

## Step 2: Permission Evaluation
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/services/record_service.py`
*   **Method Signature**: Called within `create_record` -> calls `self._require_record_write(user_id=user_id, ctx=ctx)`
*   **Details**: Invokes the `DatastoreAuthorization` engine to verify the user holds `DATASTORE_RECORD_WRITE` privileges on the pod/table scope.

---

## Step 3: Payload Sanitation and Schema Validation
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/services/record_service.py`
*   **Method Signature**: Executed inside `create_record`
*   **Details**:
    1. Instantiates a `RecordValidator` with the current table context metadata.
    2. Strips out user-submitted values targeting system columns:
       ```python
       sanitized_data = validator.strip_system_write_overrides(data)
       ```
    3. Runs standard type, required fields, and enum validation checks:
       ```python
       is_valid, errors, error_details = validator.validate(sanitized_data, is_creation=True)
       ```
    4. Validates foreign key constraints or user references via `_validate_user_reference_columns`.

---

## Step 4: Database RLS Context Setting & SQL Insertion
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/infrastructure/record_repository.py`
*   **Method Signature**: 
    ```python
    async def create_record(self, ctx: TableContext, data: dict, user_id: UUID)
    ```
*   **Details**:
    1. Connects to the database session.
    2. Sets RLS variables locally on the transaction connection to propagate user claims down to policy executors:
       ```python
       await self.schema_manager.set_rls_context(session, user_id, is_pod_admin=False)
       ```
    3. Runs dynamic SQL insert statements binding the sanitized input payload keys.

---

## Step 5: Event Broadcasting
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/services/record_service.py`
*   **Method Signature**: `await self._emit_record_event(...)`
*   **Details**:
    1. Captures the generated primary key of the new record.
    2. Constructs a `DatastoreRecordEvent` containing the table name, pod UUID, action metadata, and row changes payload.
    3. Publishes the event to the system message bus:
       ```python
       await self.message_bus.publish(DATASTORE_EVENTS_STREAM, event)
       ```
       This streams the update live to listening webhooks, workflows, and WebSocket clients.
