import uuid
from datetime import datetime, timezone

from app.database import Message, Session, SessionLocal


class SessionService:
    def create_session(self, title: str = "新对话") -> str:
        db = SessionLocal()
        try:
            row = Session(id=str(uuid.uuid4()), title=title)
            db.add(row)
            db.commit()
            return row.id
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

    def ensure_session(self, session_id: str, title: str) -> str:
        """确保指定 id 的会话存在（用于示例项目的稳定 session）。"""
        db = SessionLocal()
        try:
            row = db.get(Session, session_id)
            short_title = title[:40] + ("..." if len(title) > 40 else "")
            if not row:
                db.add(Session(id=session_id, title=short_title))
            elif row.title == "新对话" and short_title:
                row.title = short_title
            db.commit()
            return session_id
        finally:
            db.close()

    def add_message(self, session_id: str, role: str, content: str) -> None:
        db = SessionLocal()
        try:
            db.add(Message(session_id=session_id, role=role, content=content))
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


session_service = SessionService()
