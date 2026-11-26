from typing import Literal
from pydantic import BaseModel, Field

class Cover(BaseModel):
    color: str = "#2F4BA0"

class JournalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=40)
    cover: Cover = Field(default_factory=Cover)
    visibility: Literal["private", "friends", "selected"] = "private"
    shared_with: list[str] = Field(default_factory=list)

class PageCreate(BaseModel):
    journal_id: str | None = None
    title: str = Field(default="", max_length=120)
    body: str = Field(min_length=1)

class NoteCreate(BaseModel):
    page_id: str
    text: str = Field(min_length=1, max_length=280)

class PageUpdate(BaseModel):
    journal_id: str | None = None
    title: str = Field(default=None, max_length=120)
    body: str = Field(default=None, min_length=1)

class JournalUpdate(BaseModel):
    title: str = Field(default=None, min_length=1, max_length=40)
    cover: Cover = Field(default=None)
    visibility: Literal["private", "friends", "selected"] = Field(default=None)
