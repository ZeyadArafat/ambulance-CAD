from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DispatchAssignment, Patient, PrehospitalAssessment, User, utc_now

router = APIRouter()


class AssessmentCreate(BaseModel):
    patient_id: UUID
    assessed_by: UUID
    consciousness_level: str
    airway_status: str
    breathing_status: str
    circulation_status: str
    heart_rate: int | None = Field(default=None, ge=0)
    respiratory_rate: int | None = Field(default=None, ge=0)
    systolic_bp: int | None = Field(default=None, ge=0)
    diastolic_bp: int | None = Field(default=None, ge=0)
    spo2: Decimal | None = Field(default=None, ge=0, le=100)
    temperature: Decimal | None = None
    pain_score: int | None = Field(default=None, ge=0, le=10)
    chief_complaint: str | None = None
    clinical_notes: str | None = None
    severity: str


@router.post("/assignments/{assignment_id}/assessments", status_code=201)
def create_assessment(
    assignment_id: UUID,
    payload: AssessmentCreate,
    db: Session = Depends(get_db),
):
    assignment = db.query(DispatchAssignment).filter(
        DispatchAssignment.assignment_id == assignment_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Dispatch assignment not found")
    if not db.query(Patient).filter(Patient.patient_id == payload.patient_id).first():
        raise HTTPException(status_code=404, detail="Patient not found")
    if not db.query(User).filter(User.user_id == payload.assessed_by, User.is_active.is_(True)).first():
        raise HTTPException(status_code=404, detail="Active assessor not found")
    assessment = PrehospitalAssessment(
        assignment_id=assignment_id,
        assessment_time=utc_now(),
        **payload.model_dump(),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


@router.get("/assignments/{assignment_id}/assessments")
def list_assessments(assignment_id: UUID, db: Session = Depends(get_db)):
    return db.query(PrehospitalAssessment).filter(
        PrehospitalAssessment.assignment_id == assignment_id
    ).order_by(PrehospitalAssessment.assessment_time.desc()).all()
