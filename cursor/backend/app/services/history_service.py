import json
import uuid
from datetime import datetime, timezone

from app.database import Message, Session, SessionLocal
from app.schemas.ai_output import AIStructuredOutput, MessageRecord, SessionSummary


class HistoryService:
    def create_session(self, title: str = "新对话") -> str:
        db = SessionLocal()
        try:
            s = Session(id=str(uuid.uuid4()), title=title)
            db.add(s)
            db.commit()
            return s.id
        finally:
            db.close()

    def get_or_create(self, session_id: str | None) -> str:
        if session_id:
            db = SessionLocal()
            try:
                if db.get(Session, session_id):
                    return session_id
            finally:
                db.close()
        return self.create_session()

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        structured: AIStructuredOutput | None = None,
    ) -> None:
        db = SessionLocal()
        try:
            msg = Message(
                session_id=session_id,
                role=role,
                content=content,
                structured_json=structured.model_dump_json() if structured else None,
            )
            db.add(msg)
            session = db.get(Session, session_id)
            if session:
                session.updated_at = datetime.now(timezone.utc)
                if role == "user" and session.title == "新对话":
                    session.title = content[:40] + ("..." if len(content) > 40 else "")
            db.commit()
        finally:
            db.close()

    def get_history(self, session_id: str) -> list[dict[str, str]]:
        db = SessionLocal()
        try:
            rows = (
                db.query(Message)
                .filter(Message.session_id == session_id)
                .order_by(Message.created_at)
                .all()
            )
            return [{"role": r.role, "content": r.content} for r in rows]
        finally:
            db.close()

    def list_sessions(self) -> list[SessionSummary]:
        db = SessionLocal()
        try:
            sessions = db.query(Session).order_by(Session.updated_at.desc()).limit(50).all()
            result = []
            for s in sessions:
                count = db.query(Message).filter(Message.session_id == s.id).count()
                result.append(
                    SessionSummary(
                        id=s.id,
                        title=s.title,
                        created_at=s.created_at.isoformat() if s.created_at else "",
                        updated_at=s.updated_at.isoformat() if s.updated_at else "",
                        message_count=count,
                    )
                )
            return result
        finally:
            db.close()

    def get_messages(self, session_id: str) -> list[MessageRecord]:
        db = SessionLocal()
        try:
            rows = (
                db.query(Message)
                .filter(Message.session_id == session_id)
                .order_by(Message.created_at)
                .all()
            )
            records = []
            for r in rows:
                structured = None
                if r.structured_json:
                    structured = AIStructuredOutput(**json.loads(r.structured_json))
                records.append(
                    MessageRecord(
                        id=r.id,
                        role=r.role,
                        content=r.content,
                        structured_output=structured,
                        created_at=r.created_at.isoformat() if r.created_at else "",
                    )
                )
            return records
        finally:
            db.close()


history_service = HistoryService()
