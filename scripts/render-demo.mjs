// Replays captured CLI output; this renderer never contacts Semrush or runs writes.
// Requires Python 3 with Pillow and a monospace font. See docs/demo/README.md.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scenes = JSON.parse(await readFile(new URL('../docs/demo/scenes.json', import.meta.url), 'utf8'));
const renderer = `
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont
scenes = json.load(sys.stdin)
font_path = os.environ.get('DEMO_FONT')
if not font_path:
    font_path = subprocess.check_output(['fc-match', '-f', '%{file}', 'monospace'], text=True)
font = ImageFont.truetype(font_path, 23)
width, height = 1200, 420
left, top, line_height = 26, 24, 32
columns = 81
purple = '#c4a7ff'
prompt = '#a970ff'
for scene in scenes:
    command = '$ ' + scene['command']
    output = scene['output'].rstrip().splitlines()
    frames, durations = [], []
    def frame(typed, lines, duration):
        image = Image.new('RGB', (width, height), '#000000')
        draw = ImageDraw.Draw(image)
        command_lines = textwrap.wrap(typed, columns, subsequent_indent='  ',
            replace_whitespace=False, drop_whitespace=False) or ['']
        y = top
        for line in command_lines:
            draw.text((left, y), line, font=font, fill=prompt)
            y += line_height
        for line in lines:
            draw.text((left, y), line, font=font, fill=purple)
            y += line_height
        if y + line_height > height:
            raise ValueError('Demo output does not fit: ' + scene['name'])
        if not lines:
            last = command_lines[-1]
            x = left + draw.textlength(last, font=font)
            draw.rectangle((x, y-line_height+4, x+12, y-4), fill=purple)
        frames.append(image)
        durations.append(duration)
    frame('', [], 500)
    for end in range(3, len(command), 3):
        frame(command[:end], [], 70)
    frame(command, [], 550)
    for count in range(1, len(output)+1):
        frame(command, output[:count], 85)
    durations[-1] = 4800
    destination = os.path.join('assets', 'demo-' + scene['name'] + '.gif')
    frames[0].save(destination, save_all=True, append_images=frames[1:],
        duration=durations, loop=0, optimize=True, disposal=1)
    frames[-1].save(os.path.join('assets', 'demo-' + scene['name'] + '.png'))
    print(destination, str(len(frames)) + ' frames', str(sum(durations)/1000) + 's')
`;
const render = spawnSync(process.env.PYTHON || 'python3', ['-c', renderer], {
  cwd: root,
  input: JSON.stringify(scenes),
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (render.error) throw render.error;
if (render.status !== 0) process.exit(render.status || 1);
