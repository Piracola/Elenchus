const KNOWN_MOJIBAKE_FIXES: ReadonlyArray<[fragment: string, repaired: string]> = [
    ['姝ｅ湪鏁寸悊涓婁笅鏂', '正在整理上下文...'],
    ['姝ｅ湪鍒囨崲鍙戣█鏂', '正在切换发言方...'],
    ['缁勫唴璁ㄨ姝ｅ湪灞曞紑', '组内讨论正在展开...'],
    ['杈╂墜姝ｅ湪鎬濊€冨苟缁勭粐鍙戣█', '辩手正在思考并组织发言...'],
    ['姝ｅ湪璋冪敤宸ュ叿鏍搁獙浜嬪疄', '正在调用工具核验事实...'],
    ['瑁佸垽姝ｅ湪璇勪及鏈疆琛ㄧ幇', '裁判正在评估本轮表现...'],
    ['鍑嗗杩涘叆涓嬩竴鍥炲悎', '准备进入下一回合...'],
    ['杈╄鍑嗗涓', '辩论准备中...'],
    ['杈╄宸插畬鎴', '辩论已完成'],
    ['鍑虹幇閿欒', '出现错误'],
    ['绯荤粺閿欒', '系统错误'],
    ['瑙備紬鍙戣█', '观众发言'],
];

function repairDebateStartText(text: string): string {
    if (!text.includes('杈╄寮€濮')) {
        return text;
    }

    const topic = text.replace(/^.*?[\s:：]+/, '').trim();
    return topic ? `辩论开始：${topic}` : '辩论开始';
}

export function repairKnownMojibakeText(text: string): string {
    if (!text) return text;

    const repairedDebateStart = repairDebateStartText(text);
    if (repairedDebateStart !== text) {
        return repairedDebateStart;
    }

    const normalized = text.trim();
    for (const [fragment, repaired] of KNOWN_MOJIBAKE_FIXES) {
        if (normalized.includes(fragment)) {
            return repaired;
        }
    }

    return text;
}

export function repairTextTree(value: unknown): unknown {
    if (typeof value === 'string') {
        return repairKnownMojibakeText(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => repairTextTree(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key,
            repairTextTree(item),
        ]),
    );
}
