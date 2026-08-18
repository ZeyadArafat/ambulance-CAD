from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Dispatch, Incident

router = APIRouter()


class AmbulanceCreate(BaseModel):
    code: str
    status: str = "available"
    ambulance_type: str = "basic_life_support"
    latitude: float | None = None
    longitude: float | None = None


class AmbulanceUpdate(BaseModel):
    code: str | None = None
    status: str | None = None
    ambulance_type: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class AmbulanceResponse(AmbulanceCreate):
    id: int

    model_config = {"from_attributes": True}


@router.post("/", response_model=AmbulanceResponse, status_code=201)
def create_ambulance(payload: AmbulanceCreate, db: Session = Depends(get_db)):
    ambulance = Ambulance(**payload.model_dump())
    db.add(ambulance)
    db.commit()
    db.refresh(ambulance)
    return ambulance


@router.get("/", response_model=list[AmbulanceResponse])
def list_ambulances(db: Session = Depends(get_db)):
    return db.query(Ambulance).order_by(Ambulance.id).all()


# --------------------------------------------------------------------------------------------------
@router.put("/{ambulance_id}", response_model=AmbulanceResponse)
def update_ambulance(ambulance_id: int, payload: AmbulanceUpdate, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(ambulance, key, value)

    db.commit()
    db.refresh(ambulance)
    return ambulance


@router.delete("/code/{code}", status_code=204)
def delete_ambulance_by_code(code: str, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.code == code).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    db.query(Dispatch).filter(Dispatch.ambulance_id == ambulance.id).delete()
    db.query(Incident).filter(Incident.assigned_ambulance_id == ambulance.id).update({
        Incident.assigned_ambulance_id: None
    })

    db.delete(ambulance)
    db.commit()
    return Response(status_code=204)
