from datetime import datetime

from pydantic import BaseModel, Field, field_validator


ALLOWED_CURRENCIES = {"USD", "INR", "EUR", "GBP"}


class PaymentRequest(BaseModel):
    user_id: str = Field(min_length=1)
    amount: float
    currency: str = Field(min_length=3, max_length=3)
    idempotency_key: str = Field(min_length=1)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("must be greater than 0")
        if value > 100000:
            raise ValueError("must be less than or equal to 100000")
        return value

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        value = value.upper()
        if value not in ALLOWED_CURRENCIES:
            raise ValueError(f"must be one of {sorted(ALLOWED_CURRENCIES)}")
        return value


class PaymentEvent(BaseModel):
    event_id: str
    event_type: str = "payment_initiated"
    user_id: str
    amount: float
    currency: str
    idempotency_key: str
    occurred_at: str

