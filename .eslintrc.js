module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: [
    'standard',
    'standard-react',
    'plugin:react-hooks/recommended',
    'eslint:recommended',
    'plugin:react/recommended',
    'prettier',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    NodeJS: 'readonly',
  },
  plugins: ['@typescript-eslint', 'react', 'prettier', 'graphql'],
  rules: {
    'no-use-before-define': 0,
    '@typescript-eslint/no-use-before-define': 0,
    '@typescript-eslint/no-shadow': ['warn'],
    '@typescript-eslint/no-unused-vars': ['error'],
    'react/display-name': 0,
    'react/no-unescaped-entities': 0,
    'react/prop-types': 0,
    'react/jsx-handler-names': 0,
    'react/jsx-no-bind': 'warn',
    'react/react-in-jsx-scope': 'off',
    'react-native/no-inline-styles': 0,
    'react-hooks/exhaustive-deps': 'off',
    camelcase: 0,
    radix: 0,
    'prettier/prettier': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
        'no-shadow': 'off',
      },
    },
  ],
}
