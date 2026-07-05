"""Auth package.

The legacy Streamlit helpers are loaded lazily so the lightweight web server can
reuse crypto/db modules without importing Streamlit.
"""

_SERVICE_EXPORTS = {
    "bootstrap_auth",
    "login_user",
    "register_user",
    "login_admin",
    "logout_user",
    "save_user_workspace",
}

__all__ = sorted(_SERVICE_EXPORTS)


def __getattr__(name):
    if name not in _SERVICE_EXPORTS:
        raise AttributeError(name)
    from auth import service

    return getattr(service, name)
