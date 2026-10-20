from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(_: CurrentUser) -> list[UserOut]:
    users = await User.all().order_by("name", "id")
    return [UserOut.model_validate(u) for u in users]
