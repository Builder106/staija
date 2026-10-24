/**
 * Safe Math Expression Parser & Evaluator
 *
 * Evaluates mathematical expressions strictly without `eval`, `Function`,
 * or global execution context. Only allowed arithmetic operators,
 * standard mathematical constants, and pure Math functions are supported.
 */

export type CompiledMathFn = (x: number, params?: Record<string, number>) => number;

type TokenType =
  | 'NUMBER'
  | 'IDENT'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number;
  pos: number;
}

const ALLOWED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'sqrt',
  'cbrt',
  'abs',
  'exp',
  'ln',
  'log',
  'log10',
  'log2',
  'floor',
  'ceil',
  'round',
  'sign',
  'min',
  'max',
]);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers (integers or decimals)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      let numStr = '';
      const start = i;
      while (i < input.length && (/[0-9]/.test(input[i]) || input[i] === '.')) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr), pos: start });
      continue;
    }

    // Identifiers (functions, constants, variables like 'x' or slider names)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'IDENT', value: ident.toLowerCase(), pos: start });
      continue;
    }

    // Operators
    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ch, pos: i });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at index ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

interface ASTNode {
  eval: (x: number, params?: Record<string, number>) => number;
}

class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private consume(type?: TokenType): Token {
    const tok = this.tokens[this.current];
    if (type && tok.type !== type) {
      throw new Error(`Expected token ${type} but found ${tok.type} ('${tok.value}') at pos ${tok.pos}`);
    }
    this.current++;
    return tok;
  }

  parse(): ASTNode {
    const node = this.expr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected extra tokens after expression at pos ${this.peek().pos}`);
    }
    return node;
  }

  // expr -> term ( ('+' | '-') term )*
  private expr(): ASTNode {
    let left = this.term();

    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.term();
      const prevLeft = left;
      left = {
        eval: (x, p) => (op === '+' ? prevLeft.eval(x, p) + right.eval(x, p) : prevLeft.eval(x, p) - right.eval(x, p)),
      };
    }

    return left;
  }

  // term -> power ( ('*' | '/' | '%') power )*
  private term(): ASTNode {
    let left = this.power();

    while (
      this.peek().type === 'OP' &&
      (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')
    ) {
      const op = this.consume().value;
      const right = this.power();
      const prevLeft = left;
      left = {
        eval: (x, p) => {
          const lVal = prevLeft.eval(x, p);
          const rVal = right.eval(x, p);
          if (op === '*') return lVal * rVal;
          if (op === '/') return rVal === 0 ? NaN : lVal / rVal;
          return rVal === 0 ? NaN : lVal % rVal;
        },
      };
    }

    return left;
  }

  // power -> unary ( '^' power )? (right-associative)
  private power(): ASTNode {
    const left = this.unary();

    if (this.peek().type === 'OP' && this.peek().value === '^') {
      this.consume();
      const right = this.power();
      return {
        eval: (x, p) => Math.pow(left.eval(x, p), right.eval(x, p)),
      };
    }

    return left;
  }

  // unary -> ('+' | '-')? factor
  private unary(): ASTNode {
    if (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const operand = this.unary();
      return {
        eval: (x, p) => (op === '-' ? -operand.eval(x, p) : operand.eval(x, p)),
      };
    }

    return this.factor();
  }

  // factor -> NUMBER | IDENT ('(' args ')')? | '(' expr ')'
  private factor(): ASTNode {
    const tok = this.peek();

    if (tok.type === 'NUMBER') {
      this.consume();
      const val = tok.value as number;
      return { eval: () => val };
    }

    if (tok.type === 'IDENT') {
      const name = tok.value as string;
      this.consume();

      // Function call
      if (this.peek().type === 'LPAREN') {
        this.consume('LPAREN');
        const args: ASTNode[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.expr());
          while (this.peek().type === 'COMMA') {
            this.consume('COMMA');
            args.push(this.expr());
          }
        }
        this.consume('RPAREN');

        if (!ALLOWED_FUNCTIONS.has(name)) {
          throw new Error(`Unauthorized or unknown function '${name}' at pos ${tok.pos}`);
        }

        return {
          eval: (x, p) => {
            const evaluatedArgs = args.map((a) => a.eval(x, p));
            switch (name) {
              case 'sin':
                return Math.sin(evaluatedArgs[0]);
              case 'cos':
                return Math.cos(evaluatedArgs[0]);
              case 'tan':
                return Math.tan(evaluatedArgs[0]);
              case 'asin':
                return Math.asin(evaluatedArgs[0]);
              case 'acos':
                return Math.acos(evaluatedArgs[0]);
              case 'atan':
                return Math.atan(evaluatedArgs[0]);
              case 'atan2':
                return Math.atan2(evaluatedArgs[0], evaluatedArgs[1]);
              case 'sinh':
                return Math.sinh(evaluatedArgs[0]);
              case 'cosh':
                return Math.cosh(evaluatedArgs[0]);
              case 'tanh':
                return Math.tanh(evaluatedArgs[0]);
              case 'sqrt':
                return Math.sqrt(evaluatedArgs[0]);
              case 'cbrt':
                return Math.cbrt(evaluatedArgs[0]);
              case 'abs':
                return Math.abs(evaluatedArgs[0]);
              case 'exp':
                return Math.exp(evaluatedArgs[0]);
              case 'ln':
              case 'log':
                return Math.log(evaluatedArgs[0]);
              case 'log10':
                return Math.log10(evaluatedArgs[0]);
              case 'log2':
                return Math.log2(evaluatedArgs[0]);
              case 'floor':
                return Math.floor(evaluatedArgs[0]);
              case 'ceil':
                return Math.ceil(evaluatedArgs[0]);
              case 'round':
                return Math.round(evaluatedArgs[0]);
              case 'sign':
                return Math.sign(evaluatedArgs[0]);
              case 'min':
                return Math.min(...evaluatedArgs);
              case 'max':
                return Math.max(...evaluatedArgs);
              default:
                return NaN;
            }
          },
        };
      }

      // Variable 'x'
      if (name === 'x') {
        return { eval: (x) => x };
      }

      // Mathematical constant
      if (name in CONSTANTS) {
        const val = CONSTANTS[name];
        return { eval: () => val };
      }

      // Parameter from slider or external variable
      return {
        eval: (_x, params) => {
          if (params && name in params) {
            return params[name];
          }
          throw new Error(`Undefined variable or parameter '${name}'`);
        },
      };
    }

    if (tok.type === 'LPAREN') {
      this.consume('LPAREN');
      const node = this.expr();
      this.consume('RPAREN');
      return node;
    }

    throw new Error(`Unexpected token ${tok.type} ('${tok.value}') at pos ${tok.pos}`);
  }
}

/**
 * Parses a mathematical formula string into a pure, safe, executable function.
 * @throws Error if formula contains forbidden keywords, arbitrary scripts, or syntax errors.
 */
export function compileSafeMath(formula: string): CompiledMathFn {
  if (!formula || typeof formula !== 'string') {
    throw new Error('Formula must be a non-empty string');
  }

  // Pre-filter: disallow characters commonly used in JS injection
  if (/[;{}[\]`"'$]/.test(formula)) {
    throw new Error('Formula contains forbidden characters');
  }

  const tokens = tokenize(formula);
  const parser = new Parser(tokens);
  const ast = parser.parse();

  return (x: number, params?: Record<string, number>) => {
    try {
      const res = ast.eval(x, params);
      return typeof res === 'number' && !Number.isNaN(res) ? res : NaN;
    } catch {
      return NaN;
    }
  };
}

