# Flow Trace: Table Creation

This document traces the step-by-step path of creating a schema-backed Table inside a Pod.

---

## Step 1: SDK/API Entry Point
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/api/controllers/table_controller.py`
*   **Method Signature**: 
    ```python
    async def create_table(
        pod_id: UUID,
        payload: CreateTableRequest,
        user = Depends(get_current_user),
        table_service: TableService = Depends(get_table_service)
    ) -> TableResponse
    ```
*   **Details**: Captures the requested table name, column definitions, and Row-Level Security (RLS) toggle setting from the client payload.

---

## Step 2: Service Verification & Column Materialization
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/services/table_service.py`
*   **Method Signature**: 
    ```python
    async def create_table(
        self,
        pod_id: UUID,
        table_name: str,
        primary_key_column: str,
        columns: list[ColumnSchema],
        config: dict | None,
        enable_rls: bool,
        visibility: str | None = None,
        *,
        ctx: Context
    ) -> DatastoreTableEntity
    ```
*   **Details**:
    1. Checks the user's role-based permissions via `require_table_create`.
    2. Normalizes visibility scopes.
    3. Normalizes structure and materializes auto-system columns (such as `created_at`, `updated_at`, and `user_id` if RLS is enabled) via:
       ```python
       entity.columns = materialize_table_columns(
           entity.primary_key_column,
           entity.columns,
           enable_rls=entity.enable_rls
       )
       ```
    4. Checks for pre-existing table names via the `table_repository` to prevent duplicates.
    5. Saves table configuration to the backend repository.

---

## Step 3: Physical Database Schema Creation
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/infrastructure/schema_manager.py`
*   **Method Signature**:
    ```python
    async def create_table(
        self,
        pod_id: UUID,
        table_name: str,
        primary_key_column: str,
        columns: List[ColumnSchema],
        enable_rls: bool = True
    ) -> None
    ```
*   **Details**:
    1. Obtains the Pod-specific PostgreSQL schema name (format: `pod_[pod_uuid_with_underscores]`).
    2. Sanitizes input identifiers using `sanitize_identifier`.
    3. Acquires an advisory lock to prevent concurrent PG schema bootstrap races:
       ```sql
       SELECT pg_advisory_xact_lock(hashtext(:schema_name))
       ```
    4. Evaluates data types, foreign keys, default values, and constructs the `CREATE TABLE` DDL statement.
    5. Executes the schema and table creation queries.

---

## Step 4: RLS Enforcement and Security Policy Setup
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/infrastructure/schema_manager.py`
*   **Method Signature**: Called within `create_table` -> uses helper `_user_isolation_policy_sql(schema_name, table_name)`
*   **Details**:
    If `enable_rls` is `True`, the manager executes:
    ```sql
    ALTER TABLE "{schema}"."{table}" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "{schema}"."{table}" FORCE ROW LEVEL SECURITY;
    ```
    It then creates the isolation policy checking the current connection variables:
    ```sql
    CREATE POLICY "{table}_user_isolation" ON "{schema}"."{table}"
    USING (
      NULLIF(current_setting('app.current_user_is_pod_admin', TRUE), '')::BOOLEAN
      OR user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    )
    ```

---

## Step 5: Read-Only Role Wiring (Real-Time/Ad-Hoc Query)
*   **Source File**: `lemma-platform/lemma-backend/app/modules/datastore/infrastructure/schema_manager.py`
*   **Method Signature**: `await self._try_grant_query_role(schema_name, table_name)`
*   **Details**: Grants `SELECT` and `USAGE` access on the new table to the system's RLS-subject role (`datastore_query_role`) so ad-hoc SQL runs under tight user filters.
