const fields = ['活動名', '活動名（よみがな）※ひらがなで入力', '活動名（英語）', '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム', 'メインジャンル', 'サブジャンル', '属性', '募集パート', 'ロゴ', 'アイコン', 'アー写', 'ロゴ配置位置', 'SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', 'その他SNSリンク1', 'その他SNSリンク2', 'その他SNSリンク3', 'その他SNSリンク4', 'その他SNSリンク5', 'コメント', '活動時間帯', 'バンドメンバー', 'YouTube動画URL'];
const defaults = {
    '活動形態１': ['バンド', 'ユニット', '弾き語り', '歌', '楽器ソロ'],
    '活動形態２': ['オリジナル', 'カバー'],
    '活動形態３': ['活動中', '解散', '休止中'],
    '活動プラットフォーム': ['VRChat', 'Cluster', '音源/動画', 'その他'],
    'メインジャンル': ['ポップ', 'ロック', 'メタル', 'パンク', 'ジャズ／フュージョン', 'ブルース', 'R&B／ソウル／ファンク', 'ヒップホップ／ラップ', 'エレクトロニック／ダンス', 'フォーク／カントリー', 'クラシック', 'アニメ／電波', 'インダストリアル／無調／ノイズ'],
    '属性': ['女性ボーカル', '男性ボーカル', 'インスト', 'VTuber', 'VSinger'],
    '募集パート': ['ボーカル（男性）', 'ボーカル（女性）', 'リズムギター', 'リードギター', 'ベース', 'ドラム', 'シンセ'],
    'ロゴ配置位置': ['アー写に重ねない', 'アー写に重ねる 左上', 'アー写に重ねる 左下', 'アー写に重ねる 右上', 'アー写に重ねる 右下']
};
const required = ['活動名', '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム', 'メインジャンル', 'SNSリンク（X/Twitter）', 'コメント', '活動時間帯'];
const otherAllowed = ['属性', '募集パート'];
const multiple = ['活動プラットフォーム', 'メインジャンル', '属性', '募集パート'];
function blank() { return Object.fromEntries(fields.map(key => [key, ''])); }
function videoId(value) {
    const match = /^https:\/\/(?:www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/([^\s<>"'\\]*)$/i.exec(value.trim());
    if (!match)
        return '';
    const path = match[2];
    let id = '';
    if (match[1].toLowerCase() === 'youtu.be')
        id = path.split(/[?#]/)[0];
    else if (/^watch\?/.test(path)) {
        const q = /(?:\?|&)v=([A-Za-z0-9_-]{11})(?:&|#|$)/.exec(path);
        id = q ? q[1] : '';
    }
    else {
        const q = /^(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/.exec(path);
        id = q ? q[1] : '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}
function parseImport(text) {
    if (new TextEncoder().encode(text).length > 65536)
        throw Error('64KiBを超えています。');
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!Array.isArray(data) || !data.length || data.length > 20)
        throw Error('1〜20件のバンドをJSON配列で指定してください。');
    return data.map((band, index) => {
        if (!band || typeof band !== 'object' || Array.isArray(band))
            throw Error(`${index + 1}件目がオブジェクトではありません。`);
        for (const key of Object.keys(band))
            if (!fields.includes(key) || typeof band[key] !== 'string')
                throw Error(`${index + 1}件目：項目「${key}」は未対応、または値が文字列ではありません。`);
        memberRows(band['バンドメンバー'] || '');
        return { ...blank(), ...band };
    });
}
function memberRows(value) {
    return String(value || '').split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
        const cells = line.split(/[|｜]/).map(value => value.trim());
        if (cells.length < 2 || cells.length > 3)
            throw Error(`メンバー${index + 1}：既存データの形式を確認してください。`);
        return { part: cells[0], name: cells[1], account: cells[2] || '' };
    });
}
function memberText(rows) {
    return rows.filter(row => row.part.trim() || row.name.trim() || row.account.trim()).map((row, index) => {
        if (!row.name.trim())
            throw Error(`メンバー${index + 1}：名前を入力してください。`);
        if ([row.part, row.name, row.account].some(value => /[|｜\r\n]/.test(value)))
            throw Error(`メンバー${index + 1}：入力欄に縦棒や改行は使えません。`);
        return (row.account.trim() ? [row.part, row.name, row.account] : [row.part, row.name]).map(value => value.trim()).join(' | ');
    }).join('\n');
}
function tagItems(value, key) {
    const pattern = ['メインジャンル', '活動プラットフォーム'].includes(key) ? /[,，、\n]+/ : /[,，、。\s/／]+/u;
    return [...new Set(String(value || '').split(pattern).map(value => value.trim()).map(value => key === '活動プラットフォーム' && value === '音源/動画のみ' ? '音源/動画' : value).filter(Boolean))];
}
function tagText(items) { return [...new Set(items.map(value => value.trim()).filter(Boolean))].join(', '); }
function output(bands, options = {}) {
    if (!bands.length || bands.length > 20)
        throw Error('1〜20件で登録してください。');
    const normalized = bands.map((band, index) => {
        const full = blank();
        for (const key of fields) {
            const value = String(band[key] || '').trim();
            if (value.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
                throw Error(`${index + 1}件目：${key}の文字数・制御文字を確認してください。`);
            full[key] = value;
        }
        for (const key of [...multiple, 'サブジャンル'])
            full[key] = tagText(tagItems(full[key], key));
        try {
            full['バンドメンバー'] = memberText(memberRows(full['バンドメンバー']));
        }
        catch (error) {
            throw Error(`${index + 1}件目：${error.message}`);
        }
        for (const key of (options.admin === true ? ['活動名'] : required))
            if (!full[key])
                throw Error(`${index + 1}件目：${key}は必須です。`);
        if (full['YouTube動画URL'] && !videoId(full['YouTube動画URL']))
            throw Error(`${index + 1}件目：YouTube動画URLを確認してください。`);
        for (const key of ['ロゴ', 'アイコン', 'アー写'])
            if (full[key]) {
                let url;
                try {
                    url = new URL(full[key]);
                }
                catch { }
                if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password)
                    throw Error(`${index + 1}件目：${key}はhttp/httpsのURLにしてください。`);
            }
        if (JSON.stringify(full).length > 12000)
            throw Error(`${index + 1}件目：全体が12000文字を超えています。`);
        return Object.fromEntries(Object.entries(full).filter(([, value]) => value !== ''));
    });
    const text = JSON.stringify(normalized, null, 2) + '\n';
    if (new TextEncoder().encode(text).length > 65536)
        throw Error('全体が64KiBを超えています。バンドを分けて書き出してください。');
    return text;
}
function validateOptions(value) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaults, key)))
    throw Error('選択肢の項目名を確認してください。'); const result = { ...defaults }; for (const [key, items] of Object.entries(value)) {
    if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.trim() || item.length > 200 || item.includes(',')) || new Set(items).size !== items.length)
        throw Error(`${key}は重複・空欄・カンマを含まない文字列配列にしてください。`);
    result[key] = items;
} return result; }
const BandEditor = { fields, defaults, multiple, required, otherAllowed, blank, videoId, parseImport, output, validateOptions, memberRows, memberText, tagItems, tagText };
export default BandEditor;
