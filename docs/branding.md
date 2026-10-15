# Branding

The documentation uses Semrush violet `#421983` as its page background, with
white text, darker violet code and search surfaces, and orange accents.
The source color is `base.violet.700` in
[Semrush Intergalactic](https://github.com/semrush/intergalactic/blob/367db904dd1814deb91bd39d6a579b0903b38b9d/tools/theme/src/dark.json).

The logo preserves the official Semrush comet silhouette and adds a larger
terminal prompt and a purple tail. Its source is the SVG icon in the
[official logo pack](https://brand.semrush.com/Semrush%20Logo.zip).
Semrush owns the underlying mark. This is an independent, unofficial tool.

`assets/logo.svg` is the canonical vector asset. `assets/logo.png` is its
transparent raster export. The documentation serves copies of these assets.
The README follows the centered logo, flat badges, short introduction and
lowercase sections used in Microck's Raft, Kagi and Wallapop repositories.

## Typography

Semrush's live homepage uses Lazzer for its main heading and Inter for body text.
The documentation uses the same pairing, verified from computed styles and
loaded font resources on 2026-10-15. The Intergalactic documentation also uses
Inter. Lazzer loads directly from Semrush's CORS-enabled
[official font stylesheet](https://www.semrush.com/__static__/fonts/lazzer/v2/lazzer.css).
Inter loads through the Google Fonts stylesheet used by Semrush. Font binaries
are not redistributed in this repository.

`assets/logo-lockup.svg` pairs the comet with an outlined lowercase Lazzer
wordmark. Its colors adapt to the reader's light or dark display. The terminal
glyph is larger than the original version and the lower comet tail is violet.
