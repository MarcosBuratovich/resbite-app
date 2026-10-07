export const colors = {
  ink: "#343043",
  muted: "#777180",
  aqua: "#89CAC7",
  aquaSoft: "#E8F6F3",
  aquaDark: "#245F60",
  cream: "#FAF5F0",
  paper: "#FFFFFF",
  pink: "#F2ADB2",
  pinkSoft: "#FCEAEC",
  purple: "#BFB5BF",
  purpleSoft: "#F0EDF4",
  line: "#E9E5E9",
  error: "#A33142",
};
export const fonts = {
  body: "Montserrat",
  medium: "MontserratSemi",
  bold: "MontserratBold",
  display: "Quicksand",
};

// Warm, low-opacity shadows separate surfaces without heavy outlines.
export const depth = {
  card: "0 2px 3px rgba(64, 44, 65, 0.025), 0 8px 22px rgba(64, 44, 65, 0.065)",
  small: "0 2px 5px rgba(64, 44, 65, 0.07)",
  button:
    "0 2px 0 rgba(178, 105, 127, 0.20), 0 6px 14px rgba(178, 105, 127, 0.18)",
  pressed: "0 1px 3px rgba(64, 44, 65, 0.10)",
};

// Category tints and inks (CE-D5). Each ink meets 4.5:1 on its tint and on white.
export const categoryPalette = {
  creative: { tint: "#FCEAEC", ink: "#963F58" },
  intellectual: { tint: "#F0EDF4", ink: "#665381" },
  mindful: { tint: "#E8F6F3", ink: "#245F60" },
  natural: { tint: "#EAF4E4", ink: "#3D6B35" },
  physical: { tint: "#FDF1E3", ink: "#8A5A1C" },
  community: { tint: "#FAF5F0", ink: "#7A4E2D" },
  uplifting: { tint: "#FFF7DC", ink: "#7A6012" },
} as const;
