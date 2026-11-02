"""The `Schema` base class every request/response model derives from."""

from datetime import date

from pydantic import BaseModel, ConfigDict


class Schema(BaseModel):
    # A response always carries every field, defaulted ones included, so the
    # OpenAPI schema lists them as required on the response side. The
    # frontend's generated types (frontend/src/api/schema.d.ts) then read
    # `memo: string | null` rather than an optional `memo?:`. Request schemas
    # are unaffected: a defaulted field stays optional there.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


# Alias used where a model field is itself named `date`: pydantic v2 resolves
# annotations using the class's own namespace, and a field named the same as
# its type (with a default) gets shadowed by that default there, so the bare
# `date` name can't be used as the annotation in that case.
_DateType = date
