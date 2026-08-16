from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Ambulance(Base):
    __tablename__ = "ambulances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="available", index=True)
    ambulance_type: Mapped[str] = mapped_column(String(50), default="basic_life_support")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location: Mapped[object | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", index=True)
    incident_type: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float]
    longitude: Mapped[float]
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    assigned_ambulance_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    latitude: Mapped[float]
    longitude: Mapped[float]
    emergency_capacity: Mapped[int] = mapped_column(Integer, default=0)
    icu_available: Mapped[int] = mapped_column(Integer, default=0)


class Dispatch(Base):
    __tablename__ = "dispatches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_id: Mapped[int] = mapped_column(Integer, ForeignKey("incidents.id"), nullable=False)
    ambulance_id: Mapped[int] = mapped_column(Integer, ForeignKey("ambulances.id"), nullable=False)
    status: Mapped[str] = mapped_column(String, default="dispatched", nullable=False)
    dispatched_at: Mapped[datetime] = mapped_column(DateTime,default=utc_now() ,nullable=False)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)