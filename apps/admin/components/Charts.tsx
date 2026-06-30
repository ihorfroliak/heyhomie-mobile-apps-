import React from 'react';
import Svg, { Rect, Circle, Text as SvgText } from 'react-native-svg';
import { colors } from '@heyhomie/design';
import type { Bucket } from '@heyhomie/domain';

interface BarProps {
    data: Bucket[];
    width?: number;
    height?: number;
    color?: string;
    /** Optional label formatter for the x-axis. */
    formatKey?: (key: string) => string;
}

/** Simple vertical bar chart (SVG, no external chart lib). */
export function BarChart({ data, width = 300, height = 150, color = colors.blue, formatKey }: BarProps) {
    const max = Math.max(1, ...data.map(d => d.value));
    const slot = data.length ? width / data.length : width;
    const barW = Math.max(6, slot - 10);
    const chartH = height - 22;

    return (
        <Svg width={width} height={height}>
            {data.map((d, i) => {
                const h = (d.value / max) * chartH;
                const x = i * slot + (slot - barW) / 2;
                return (
                    <React.Fragment key={d.key}>
                        <Rect x={x} y={chartH - h} width={barW} height={h} rx={4} fill={color} />
                        <SvgText x={i * slot + slot / 2} y={height - 6} fontSize="9" fill={colors.grey} textAnchor="middle">
                            {(formatKey ?? (k => k))(d.key)}
                        </SvgText>
                    </React.Fragment>
                );
            })}
        </Svg>
    );
}

interface DonutProps {
    /** Ratio 0–1. */
    value: number;
    size?: number;
    color?: string;
    stroke?: number;
}

/** Ring chart for a single ratio (e.g. completion rate). */
export function Donut({ value, size = 110, color = colors.success, stroke = 12 }: DonutProps) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.min(1, Math.max(0, value)));
    return (
        <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
        </Svg>
    );
}
