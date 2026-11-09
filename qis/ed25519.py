"""Ed25519 전자서명 — 순수 파이썬 (외부 라이브러리 없음).

라이선스 파일 검증에 쓴다. 서명 한 번 · 검증 한 번이면 느려도 상관없어서(수십 ms) 표준 라이브러리만으로 구현했다.
RFC 8032 를 그대로 따른 참조 구현의 축약판. 비밀키 32바이트 · 공개키 32바이트 · 서명 64바이트.
"""
from __future__ import annotations

import hashlib
import secrets

_Q = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _Q - 2, _Q) % _Q
_I = pow(2, (_Q - 1) // 4, _Q)


def _h(m: bytes) -> bytes:
    return hashlib.sha512(m).digest()


def _xrecover(y: int) -> int:
    xx = (y * y - 1) * pow(_D * y * y + 1, _Q - 2, _Q)
    x = pow(xx, (_Q + 3) // 8, _Q)
    if (x * x - xx) % _Q != 0:
        x = x * _I % _Q
    if x % 2 != 0:
        x = _Q - x
    return x


_BY = 4 * pow(5, _Q - 2, _Q) % _Q
_B = (_xrecover(_BY), _BY, 1, _xrecover(_BY) * _BY % _Q)   # 확장 좌표 (X, Y, Z, T)


def _add(p, q):
    x1, y1, z1, t1 = p
    x2, y2, z2, t2 = q
    a = (y1 - x1) * (y2 - x2) % _Q
    b = (y1 + x1) * (y2 + x2) % _Q
    c = t1 * 2 * _D * t2 % _Q
    dd = z1 * 2 * z2 % _Q
    e, f, g, hh = b - a, dd - c, dd + c, b + a
    return e * f % _Q, g * hh % _Q, f * g % _Q, e * hh % _Q


def _mul(p, e: int):
    r = (0, 1, 1, 0)
    while e > 0:
        if e & 1:
            r = _add(r, p)
        p = _add(p, p)
        e >>= 1
    return r


def _encode_point(p) -> bytes:
    x, y, z, _ = p
    zi = pow(z, _Q - 2, _Q)
    x, y = x * zi % _Q, y * zi % _Q
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def _decode_point(s: bytes):
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    if y >= _Q:
        raise ValueError("bad point")
    x = _xrecover(y)
    if x & 1 != sign:
        x = _Q - x
    p = (x, y, 1, x * y % _Q)
    if not _on_curve(p):
        raise ValueError("bad point")
    return p


def _on_curve(p) -> bool:
    x, y, z, _ = p
    zi = pow(z, _Q - 2, _Q)
    x, y = x * zi % _Q, y * zi % _Q
    return (-x * x + y * y - 1 - _D * x * x * y * y) % _Q == 0


def _secret_expand(sk: bytes):
    hh = _h(sk)
    a = int.from_bytes(hh[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, hh[32:]


def generate_keypair() -> tuple[bytes, bytes]:
    """(비밀키 32바이트, 공개키 32바이트)"""
    sk = secrets.token_bytes(32)
    return sk, public_key(sk)


def public_key(sk: bytes) -> bytes:
    a, _ = _secret_expand(sk)
    return _encode_point(_mul(_B, a))


def sign(sk: bytes, msg: bytes) -> bytes:
    a, prefix = _secret_expand(sk)
    pk = _encode_point(_mul(_B, a))
    r = int.from_bytes(_h(prefix + msg), "little") % _L
    rb = _encode_point(_mul(_B, r))
    k = int.from_bytes(_h(rb + pk + msg), "little") % _L
    s = (r + k * a) % _L
    return rb + s.to_bytes(32, "little")


def verify(pk: bytes, msg: bytes, sig: bytes) -> bool:
    if len(pk) != 32 or len(sig) != 64:
        return False
    try:
        a = _decode_point(pk)
        rp = _decode_point(sig[:32])
    except ValueError:
        return False
    s = int.from_bytes(sig[32:], "little")
    if s >= _L:
        return False
    k = int.from_bytes(_h(sig[:32] + pk + msg), "little") % _L
    left = _mul(_B, s)
    right = _add(rp, _mul(a, k))
    return _encode_point(left) == _encode_point(right)
