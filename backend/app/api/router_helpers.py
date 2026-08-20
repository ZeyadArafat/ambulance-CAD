from fastapi import HTTPException


def get_or_404(db, model, key, value, label: str):
    item = db.query(model).filter(key == value).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item
