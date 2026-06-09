from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TransactionBase(BaseModel):
    transaction_no: str = Field(..., max_length=64)
    card_no: str = Field(..., max_length=32)
    card_hash: str = Field(..., max_length=128)
    device_id: Optional[str] = Field(default=None, max_length=128)
    amount: Decimal = Field(..., decimal_places=2, max_digits=18)
    merchant_id: Optional[str] = Field(default=None, max_length=64)
    merchant_name: Optional[str] = Field(default=None, max_length=200)
    region: Optional[str] = Field(default=None, max_length=100)
    region_code: Optional[str] = Field(default=None, max_length=20)
    is_overseas: bool = False
    transaction_time: datetime
    lat: Optional[float] = None
    lng: Optional[float] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    device_id: Optional[str] = Field(default=None, max_length=128)
    merchant_id: Optional[str] = Field(default=None, max_length=64)
    merchant_name: Optional[str] = Field(default=None, max_length=200)
    region: Optional[str] = Field(default=None, max_length=100)
    region_code: Optional[str] = Field(default=None, max_length=20)
    is_overseas: Optional[bool] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class TransactionResponse(TransactionBase):
    id: int

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int


class EvaluateTransactionRequest(BaseModel):
    transaction: TransactionCreate
    force_reevaluate: bool = False
