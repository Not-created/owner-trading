"""
Pydantic base models for MongoDB documents.
Handles ObjectId <-> str conversion; datetime as ISO strings.
"""
from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _to_str(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_to_str)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict[str, Any]:
        d = self.model_dump(by_alias=True, exclude_none=True)
        if "_id" in d and isinstance(d["_id"], str):
            try:
                d["_id"] = ObjectId(d["_id"])
            except Exception:
                d.pop("_id", None)
        return d

    @classmethod
    def from_mongo(cls, doc: dict[str, Any] | None):
        if not doc:
            return None
        return cls(**doc)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
