"""Shared colour palette (sRGB hex) so every asset matches.

PAINT and PAINT2 are key colours: the game replaces them at load time with a
car's livery colours, so one mesh supports any number of paint schemes.
"""

PAINT = 0xFF00FF  # livery primary (magenta key)
PAINT2 = 0x00FFFF  # livery secondary (cyan key)

BLACK = 0x161616
DARK = 0x2A2A2E
GREY = 0x6E6E74
LIGHT_GREY = 0xB4B4BA
WHITE = 0xEEEEEE
GLASS = 0x1C2838
HEADLIGHT = 0xFFF4C0
TAILLIGHT = 0xD01818
ORANGE = 0xF07818
YELLOW = 0xF0C820
RED = 0xC02020
BLUE = 0x2050C0

TRUNK = 0x5A3E26
PINE = [0x1F4F26, 0x2A6230, 0x33733A]
LEAF = [0x3F7F2F, 0x4C9236, 0x5AA040]
BUSH = 0x356C2A
ROCK = [0x8A8478, 0x7A7468, 0x968F82]
ROOF_TILE = 0xA8402C
WALL_PLASTER = 0xE6DCC8
WOOD = 0x8A6440
CROWD = [0xD03030, 0x3050D0, 0xE0C030, 0xF0F0F0, 0x30A050, 0xE07020, 0x202020]


def rgba(hex_color):
    """Hex sRGB → (r, g, b, a) floats in 0..1, still sRGB."""
    return (
        ((hex_color >> 16) & 255) / 255.0,
        ((hex_color >> 8) & 255) / 255.0,
        (hex_color & 255) / 255.0,
        1.0,
    )
