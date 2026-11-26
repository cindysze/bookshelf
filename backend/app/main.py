from datetime import datetime, timezone
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from pymongo import ReturnDocument
from app.db import client, journals, pages
from app.models import JournalCreate, PageCreate, PageUpdate
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)

def to_json(doc):
    """MongoDB ids are a special type; turn them into normal strings"""
    doc["_id"] = str(doc["_id"])
    return doc

@app.get("/health")
async def health():
    await client.admin.command("ping")
    return {"status": "ok"}

@app.post("/journals")
async def create_journal(journal: JournalCreate):
    doc = journal.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    result = await journals.insert_one(doc) # Atlas is computing
    doc["_id"] = str(result.inserted_id)
    return doc

@app.get("/journals")
async def list_journals():
    docs = await journals.find().sort("created_at", 1).to_list()
    for doc in docs:
        to_json(doc)
        doc["page_count"] = await pages.count_documents({"journal_id": doc["_id"]})
    return docs

@app.post("/pages")
async def create_page(page: PageCreate):
    doc = page.model_dump()
    now = datetime.now(timezone.utc)
    doc["created_at"] = now
    doc["updated_at"] = now
    await pages.insert_one(doc)
    return to_json(doc)

@app.get("/pages")
async def list_pages(journal_id: str | None = None):
    docs = await pages.find({"journal_id": journal_id}).sort("updated_at", 1).to_list()
    return [to_json(d) for d in docs]

@app.patch("/pages/{page_id}")
async def update_page(page_id: str, changes: PageUpdate):
    updates = changes.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await pages.find_one_and_update(
        {"_id": ObjectId(page_id)},
        {"$set": updates},
        return_document = ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return to_json(result)