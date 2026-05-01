from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = UserRole.viewer


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
