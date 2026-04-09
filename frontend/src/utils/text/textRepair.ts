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
    ['杈╄鍑洪敊', '辩论出错'],
    ['绯荤粺杩愯鍑洪敊', '系统运行出错'],
    ['鍑虹幇閿欒', '出现错误'],
    ['绯荤粺閿欒', '系统错误'],
    ['绯荤粺', '系统'],
    ['瑙備紬鍙戣█', '观众发言'],
];

const PROVIDER_MESSAGE_FIXES: ReadonlyArray<[fragment: string, repaired: string]> = [
    ['Your request was blocked.', '请求被上游模型服务拦截，请检查供应商风控或内容审核策略，或切换模型后重试。'],
    [
        'Model invocation blocked: the selected agent is missing an API key. Open Settings and choose or create a default model provider first.',
        '当前智能体缺少 API Key，请在设置中选择或创建默认模型提供商后重试。',
    ],
    [
        'Model invocation blocked: the selected provider was not found. Open Settings and re-select the provider for this agent.',
        '当前智能体引用的模型提供商不存在，请在设置中重新选择该智能体的提供商。',
    ],
    [
        'Model invocation blocked: this agent references provider settings without a matching provider credential. Open Settings and choose the provider explicitly for this agent.',
        '当前智能体引用了未绑定凭证的模型提供商，请在设置中为该智能体显式选择可用提供商。',
    ],
    [
        'Model invocation blocked: custom parameters must be a JSON object.',
        '模型自定义参数格式无效，请提供 JSON 对象。',
    ],
];

const QUOTA_MARKERS = ['insufficient_user_quota', 'insufficient quota', 'remaining quota', '额度不足', '剩余额度', '预扣费额度'];
const REQUEST_ID_REGEX = /request id:\s*([^)'\s]+)/i;

function repairDebateStartText(text: string): string {
    if (!text.includes('杈╄寮€濮')) {
        return text;
    }

    const topic = text.replace(/^.*?[\s:：]+/, '').trim();
    return topic ? `辩论开始：${topic}` : '辩论开始';
}

export function repairKnownMojibakeText(text: string): string {
    if (!text) return text;

    let repairedText = repairDebateStartText(text);

    for (const [fragment, replacement] of KNOWN_MOJIBAKE_FIXES) {
        if (repairedText.includes(fragment)) {
            repairedText = repairedText.split(fragment).join(replacement);
        }
    }

    return normalizeProviderMessage(collapseNoiseOnlySuffixes(repairedText));
}

function normalizeProviderMessage(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;

    const [prefix, rest] = splitRuntimeErrorPrefix(trimmed);
    let content = rest;
    const lowered = content.toLowerCase();

    if (QUOTA_MARKERS.some((marker) => lowered.includes(marker.toLowerCase()))) {
        const requestId = REQUEST_ID_REGEX.exec(content)?.[1];
        content = `模型服务额度不足，请检查供应商账户余额或切换可用提供商后重试。${requestId ? `（request id: ${requestId}）` : ''}`;
    } else {
        for (const [fragment, replacement] of PROVIDER_MESSAGE_FIXES) {
            if (content.includes(fragment)) {
                content = content.split(fragment).join(replacement);
            }
        }
    }

    return prefix ? `${prefix}${content}` : content;
}

function splitRuntimeErrorPrefix(text: string): [prefix: string, rest: string] {
    const prefixes: ReadonlyArray<[raw: string, normalized: string]> = [
        ['辩论出错:', '辩论出错：'],
        ['辩论出错：', '辩论出错：'],
        ['系统运行出错:', '系统运行出错：'],
        ['系统运行出错：', '系统运行出错：'],
    ];

    for (const [raw, normalized] of prefixes) {
        if (text.startsWith(raw)) {
            return [normalized, text.slice(raw.length).trim()];
        }
    }

    return ['', text];
}

function collapseNoiseOnlySuffixes(text: string): string {
    for (const [, replacement] of KNOWN_MOJIBAKE_FIXES) {
        if (!text.startsWith(replacement)) continue;

        const suffix = text.slice(replacement.length);
        if (suffix && /^[\s?.!。？！…:：]*$/.test(suffix)) {
            return replacement;
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
