from __future__ import annotations
from datetime import datetime, date
from enum import Enum
from typing import List, Optional, Any
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, conint

# --- Enums representing our database ENUM types ---

class RelationshipState(str, Enum):
    waiting_on_me = "waiting_on_me"
    waiting_on_them = "waiting_on_them"
    mutual_exploration = "mutual_exploration"
    blocked = "blocked"
    cooling = "cooling"
    reengagement_candidate = "reengagement_candidate"

class InteractionType(str, Enum):
    email = "email"
    meeting = "meeting"
    slack = "slack"
    manual = "manual"

class CommitmentOwner(str, Enum):
    founder = "founder"
    contact = "contact"
    shared = "shared"

class CommitmentStatus(str, Enum):
    open = "open"
    completed = "completed"
    dismissed = "dismissed"

class RecommendationType(str, Enum):
    reconnect_email = "reconnect_email"
    action_task = "action_task"

class RecommendationStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    dismissed = "dismissed"


# --- Pydantic Data Models ---

class Contact(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    relationship_state: RelationshipState = RelationshipState.mutual_exploration
    who_are_they: Optional[str] = None
    why_talking: Optional[str] = None
    memory_confidence: Optional[dict[str, float]] = Field(
        default=None, 
        description="Confidence scores (0.0 to 1.0) for individual memory attributes"
    )
    priority_score: int = Field(default=0, ge=0)
    priority_reasons: Optional[List[str]] = Field(default_factory=list)
    last_interaction: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class RelationshipStateHistory(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    contact_id: UUID
    old_state: RelationshipState
    new_state: RelationshipState
    reason: Optional[str] = None
    changed_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class Interaction(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    contact_id: UUID
    type: InteractionType
    summary: str
    transcript_path: Optional[str] = None
    occurred_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class RelationshipMilestone(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    contact_id: UUID
    interaction_id: UUID
    summary: str
    importance_score: conint(ge=1, le=100) # 1-100 score
    occurred_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class Commitment(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    contact_id: UUID
    interaction_id: UUID
    owner: CommitmentOwner
    description: str
    status: CommitmentStatus = CommitmentStatus.open
    confidence: conint(ge=0, le=100) = 100
    due_date: Optional[date] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class Recommendation(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    contact_id: UUID
    rec_type: RecommendationType
    draft_content: Optional[str] = None
    reason_why: str
    status: RecommendationStatus = RecommendationStatus.pending
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True
