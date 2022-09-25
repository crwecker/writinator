const colors = {
  gray: {
    100: '#F0F0F0',
    200: '#E6E6E6',
    300: '#DFDEDD',
    400: '#C3C1C0',
    500: '#9D9B9A',
    600: '#7B7979',
    700: '#58595B',
    800: '#3C3C3C',
    900: '#262626',
    950: '#151515',
  },
  blue: {
    100: '#80A2AD',
    200: '#537E8D',
    300: '#326273',
    400: '#1B4C5C',
    500: '#083240',
  },
  purple: {
    100: '#381d2a',
  },
  opal: {
    100: '#96c0b7',
  },
  silk: {
    100: '#fad4c0',
  },
  coral: {
    100: '#ff8484',
  },
}

export default {
  PRIMARY: colors.blue[300],
  BACKGROUND_VERY_DARK: colors.gray[950],
  BACKGROUND_DARK: colors.gray[900],
  BACKGROUND_DEFAULT: colors.gray[800],
  BACKGROUND_LIGHT: colors.gray[700],
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  ...colors,
}
