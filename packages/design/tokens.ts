/**
 * HeyHomie design tokens — shared across client, worker and admin apps.
 * Single source of truth for the brand look so every surface stays consistent.
 */

export const colors = {
    // Brand
    primary: '#14133A', // dark navy — text & primary surfaces
    salad: '#36F0C7', // teal/mint — primary CTA
    pink: '#FF3C87', // accent / highlights
    blue: '#5465FC', // links, icons, admin accent
    grey: '#727189', // secondary text
    bgLight: '#F4F7FF', // light surface / fills
    white: '#FFFFFF',
    border: '#E7EBF6',

    // Semantic
    success: '#1D9E75',
    warning: '#EF9F27',
    danger: '#E24B4A',
    info: '#5465FC',

    // Mission status (maps to Go API statuses)
    status: {
        searching_homie: '#854F0B',
        homie_found: '#0F6E56',
        in_progress: '#185FA5',
        done: '#444441',
        canceled: '#A32D2D',
        unpaid: '#A32D2D',
        freezed: '#727189',
    },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
    fontHeading: 'Quicksand',
    fontBody: 'Lato',
    sizes: { caption: 11, small: 13, body: 15, h3: 17, h2: 22, h1: 28 },
    weights: { regular: '400', medium: '500', bold: '700' },
} as const;

export const shadow = {
    card: {
        shadowColor: '#436CCB',
        shadowOpacity: 0.2,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
    },
} as const;

export type MissionStatusColorKey = keyof typeof colors.status;
