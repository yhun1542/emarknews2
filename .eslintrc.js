module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // 코드 품질
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // 서버 로깅을 위해 허용
    'no-debugger': 'error',
    'no-alert': 'error',
    
    // 스타일
    'indent': ['error', 2],
    'quotes': ['error', 'double'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    
    // 보안
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // 성능
    'no-loop-func': 'warn',
    'no-inner-declarations': 'error',
    
    // 가독성
    'max-len': ['warn', { code: 120 }],
    'max-lines': ['warn', { max: 500 }],
    'complexity': ['warn', 10],
    
    // Node.js 특화
    'no-process-exit': 'off', // 테스트에서 필요
    'no-path-concat': 'error'
  },
  globals: {
    process: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    module: 'readonly',
    require: 'readonly',
    exports: 'readonly',
    console: 'readonly'
  }
};

