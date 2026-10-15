# Branding

The documentation uses Semrush violet `#421983` as its page background, with
white text, darker violet code and search surfaces, and orange accents.
The source color is `base.violet.700` in
[Semrush Intergalactic](https://github.com/semrush/intergalactic/blob/367db904dd1814deb91bd39d6a579b0903b38b9d/tools/theme/src/dark.json).

The project owner supplied the Semrush CLI logo. Its orange comet and outlined
wordmark are preserved. Semrush owns the underlying mark. This is an independent,
unofficial tool.

`assets/logo-lockup.svg` is the supplied light-background artwork, unchanged.
`assets/logo-lockup-dark.svg` changes only the black wordmark paths to white.
The README uses a `<picture>` element to select the correct version for the
reader's color scheme, with the light version as its fallback. The documentation
uses the white-wordmark version on its purple background.

`assets/logo.svg` uses the supplied comet paths with a compact viewport for the
favicon. `assets/logo.png` is its transparent raster export. The documentation
serves copies of these assets. The README retains the centered logo, flat badges,
short introduction and lowercase sections used in Microck's repositories.

## Typography

Semrush's live homepage uses Lazzer for its main heading and Inter for body text.
The documentation uses the same pairing, verified from computed styles and
loaded font resources on 2026-10-15. The Intergalactic documentation also uses
Inter. Lazzer loads directly from Semrush's CORS-enabled
[official font stylesheet](https://www.semrush.com/__static__/fonts/lazzer/v2/lazzer.css).
Inter loads through the Google Fonts stylesheet used by Semrush. Font binaries
are not redistributed in this repository.
