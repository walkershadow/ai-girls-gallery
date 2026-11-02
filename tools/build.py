#!/usr/bin/env python3
"""Generate data/*.js from source/ (original site metadata) and tools/i18n_*.tsv."""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source')
TOOLS = os.path.join(ROOT, 'tools')
DATA = os.path.join(ROOT, 'data')


def read(p):
    with open(p, encoding='utf8') as f:
        return f.read()


def tsv(name):
    rows = [l.rstrip('\n').split('\t') for l in read(os.path.join(TOOLS, name)).splitlines() if l.strip()]
    assert all(len(r) == 3 for r in rows), name
    return rows


def js_array(text):
    return json.loads(text[text.index('['):text.rindex(']') + 1])


def embedded(html):
    return json.loads(re.search(r'const D=(\[.*?\]);\n', html, re.S).group(1))


def emit(name, var, value):
    with open(os.path.join(DATA, name), 'w', encoding='utf8') as f:
        f.write('window.%s=%s;\n' % (var, json.dumps(value, ensure_ascii=False, separators=(',', ':'))))


T = {ja: {'zh': zh, 'en': en} for ja, zh, en in tsv('i18n_terms.tsv') + tsv('i18n_pose_names.tsv')}
W = {en: {'zh': zh, 'ja': ja} for en, zh, ja in tsv('i18n_costume_words.tsv')}

imgs = js_array(read(os.path.join(SRC, 'portrait-images.js')))
rank_src = read(os.path.join(SRC, 'portrait-ranking.js'))
rank = json.loads(rank_src[rank_src.index('{'):rank_src.rindex('}') + 1])
portrait = [{'id': x['id'], 'sec': x['section'], 'hair': x['hair'], 'style': x['style'], 'w': x['w'], 'h': x['h'],
             'tw': x['thumb_w'], 'th': x['thumb_h'], 'bytes': x['bytes'], 'full': 'portrait/' + x['full'],
             'thumb': 'portrait/' + x['thumb']} for x in imgs]
costume = [{'id': x['id'], 'cat': x['カテゴリ'], 'kw': x['キーワード'], 'thumb': 'costume/' + x['サムネ'],
            'img': 'costume/' + x['画像'], 'full': 'costume/' + x['原寸']} for x in embedded(read(os.path.join(SRC, 'costume.html')))]


def poses(site):
    return [{'id': x['id'], 'line': x['系統'], 'no': x['ポーズ番号'], 'cat': x['分類'], 'name': x['ポーズ名'],
             'ang': x['アングル'], 'thumb': site + '/' + x['サムネ'], 'full': site + '/' + x['原寸']}
            for x in embedded(read(os.path.join(SRC, site + '.html')))]


pose = poses('pose')
depth = poses('depth')

need = {x['hair'] for x in portrait} | {x['style'] for x in portrait if x['style']} | set(rank['cats']) - {'総合'}
need |= {x['cat'] for x in costume} | {v for x in pose + depth for v in (x['line'], x['cat'], x['name'], x['ang'])}
missing = sorted(need - set(T))
words = {w for x in costume for w in x['kw'].lower().split()}
missing_w = sorted(words - set(W))
assert not missing and not missing_w, (missing, missing_w)
extra = sorted(set(T) - need - {'未分類'})
assert not extra, extra

os.makedirs(DATA, exist_ok=True)
emit('terms.js', 'T', T)
emit('words.js', 'W', W)
emit('portrait.js', 'PORTRAIT', portrait)
emit('ranking.js', 'RANKING', rank)
emit('costume.js', 'COSTUME', costume)
emit('pose.js', 'POSE', pose)
emit('depth.js', 'DEPTH', depth)
print('portrait', len(portrait), 'costume', len(costume), 'pose', len(pose), 'depth', len(depth), 'terms', len(T), 'words', len(W))
