from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import ChangePasswordIn, LoginIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn) -> TokenOut:
    user = await User.get_or_none(email=payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/change-password", response_model=UserOut)
async def change_password(payload: ChangePasswordIn, user: CurrentUser) -> UserOut:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    await user.save(update_fields=["password_hash"])
    return UserOut.model_validate(user)
