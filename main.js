import { ComputeEngine } from "https://cdn.jsdelivr.net/npm/@cortex-js/compute-engine@0.28.0/dist/compute-engine.esm.js";
import p5 from "https://cdn.jsdelivr.net/npm/p5@2.0.4/lib/p5.esm.js";

const brightnessEquationElement = document.querySelector('#equation');

let iterations = [];
let symbolsMap = {};

let t0;
let s;
let hasError = false;

let sketch = p5 => {
  p5.setup = () => {
    p5.createCanvas(400, 400, p5.WEBGL);
    p5.pixelDensity(1);
    p5.noStroke();
    p5.describe('An animation written from math.');

    const animateButton = p5.select('#animate-button');
    const animate = () => {
      try {
        s = p5.createShader(...generateGLSL());
        p5.shader(s);
        s.setUniform('width', 400);
        s.setUniform('height', 400);
        s.setUniform('min_value',document.querySelector('#min-value').expression.compile()());
        s.setUniform('max_value',document.querySelector('#max-value').expression.compile()());
        s.setUniform('min_x',document.querySelector('#min-x').expression.compile()());
        s.setUniform('max_x',document.querySelector('#max-x').expression.compile()());
        s.setUniform('min_y',document.querySelector('#min-y').expression.compile()());
        s.setUniform('max_y',document.querySelector('#max-y').expression.compile()());
        s.setUniform('unit_t',document.querySelector('#unit-t').expression.compile()());
        t0 = p5.millis();
        hasError = false
      } catch (e) {
        s = null;
        console.error(e);
      }
    };
    animateButton.mouseClicked(animate);
    animate();
  }

  p5.draw = () => {
    if (s) {
      s.setUniform('time', (p5.millis() - t0) / 1000)
      try {
        p5.plane(400, 400);
      } catch (e) {
        console.log(e);
        s = null;
      }
    } else {
        p5.background('red');
    }
  }
}

const operationDict = {
  'Cos': node => `cos(${mj2gl(node[1])})`,
  'Sin': node => `sin(${mj2gl(node[1])})`,
  'Sqrt': node => `sqrt(${mj2gl(node[1])})`,
  'Floor': node => `floor(${mj2gl(node[1])})`,
  'Ceil': node => `ceil(${mj2gl(node[1])})`,
  'Abs': node => `abs(${mj2gl(node[1])})`,
  'Power': node => `pow(${mj2gl(node[1])}, ${mj2gl(node[2])})`,
  'Add': node => '(' + node.slice(1).map(mj2gl).join('+') + ')',
  'Negate': node => `(-1.*${mj2gl(node[1])})`,
  'Multiply': node => '(' + node.slice(1).map(mj2gl).join('*') + ')',
  'Multiply': node => node.length === 3 ?
  `multiply(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `multiply(${mj2gl(node[1])}, ${mj2gl(['Multiply', ...node.slice(2)])})`,
  'Norm': node => `length(${mj2gl(node[1])})`,
  'Divide': node => `(${mj2gl(node[1])} / ${mj2gl(node[2])})`,
  'Rational': node => `(${mj2gl(node[1])} / ${mj2gl(node[2])})`,
  'Mod': node => `mod(${mj2gl(node[1])}, ${mj2gl(node[2])})`,
  'Min': node => node.length === 3 ?
  `min(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `min(${mj2gl(node[1])}, ${mj2gl(['Min', ...node.slice(2)])})`,
  'Max': node => node.length === 3 ?
  `max(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `max(${mj2gl(node[1])}, ${mj2gl(['Max', ...node.slice(2)])})`,
  'Boole': node => `float(${mj2gl(node[1])})`,
  'Less': node => `(${mj2gl(node[1])} < ${mj2gl(node[2])})`,
  'LessEqual': node => `(${mj2gl(node[1])} <= ${mj2gl(node[2])})`,
  'Equal': node => `(${mj2gl(node[1])} == ${mj2gl(node[2])})`,
  'Matrix': node => `vec${node[1].length - 1}(${node[1].slice(1).map(entry => mj2gl(entry[1]))})`,
  'Subscript': node => `${mj2gl(node[1])}_${mj2gl(node[2])}`,
  'Apply': node => `${mj2gl(node[1])}(${node.slice(2).map(mj2gl).join(",")})`,
  'Tuple': node => {
    if (node?.[1]?.[0] === 'Power') {
      iterations.push({symbol: node[1][1], amount: node[1][2][2], ...symbolsMap[node[1][1]]});
      if (node?.[2]?.[0] === 'Tuple') {
        return `iterate_${node[1][1]}_${node[1][2][2]}(${node[2].slice(1).map(mj2gl).join(',')})`;
      }
      return `iterate_${node[1][1]}_${node[1][2][2]}(${mj2gl(node[2])})`;
    }
    return 'to_tuple(' + node.slice(1).map(mj2gl).join(',') + ')';
  }
}

function mj2gl(node) {
  if (Array.isArray(node)) {
    if (node[0] in operationDict) {
      return operationDict[node[0]](node);
    } else {
      return node[0]+'(' + node.slice(1).map(mj2gl).join(',') + ')';
    }
  } else if (typeof node === 'number'){
    const strRep = node.toString();
    return strRep.includes('.') ? strRep : strRep + '.0';
  } else if (['x','y','t','Pi','ExponentialE'].includes(node)){
    return node;
  } else {
    return node;
  }
}

function declareFunctions(definitionElements) {
  const computeEngine = new ComputeEngine();

  const cartesianProductSymbol = {
    name: 'CartesianProduct',
    latexTrigger: ['\\times'],
    kind: 'infix',
    associativity: 'right', 
    precedence: 390,
  };

  const R2Symbol = {
    name: 'RealNumbers2',
    latexTrigger: ['\\R^2'],
    kind: 'expression',
  };

  const R3Symbol = {
    name: 'RealNumbers3',
    latexTrigger: ['\\R^3'],
    kind: 'expression',
  };

  const R4Symbol = {
    name: 'RealNumbers4',
    latexTrigger: ['\\R^4'],
    kind: 'expression',
  };

  computeEngine.latexDictionary = computeEngine.latexDictionary.concat([cartesianProductSymbol, R2Symbol, R3Symbol, R4Symbol]);
  MathfieldElement.computeEngine = computeEngine;

  const parseFunctionSymbol = symbol => {
    if (!Array.isArray(symbol)) {
      return symbol
    }
    return `${symbol[1]}_${symbol[2][1]}_${symbol[2][2]}`;
  }

  const functionDeclarations = [];
  const allSignatures = new Set();
  
  for (let definitionElement of definitionElements) {
    const symbolElement = definitionElement.querySelector('.user-function-symbol');
    const equationElement = definitionElement.querySelector('.user-function-equation');
    const inputsElement = definitionElement.querySelector('.user-function-inputs');
    const functionSymbol = parseFunctionSymbol(JSON.parse(symbolElement.getValue('math-json')));
    const functionInputs = JSON.parse(inputsElement.getValue('math-json'));
    const variables = Array.isArray(functionInputs) ? functionInputs.slice(1) : [functionInputs];

    const mathjson2glsl = {
      "RealNumbers": "float",
      "RealNumbers2": "vec2",
      "RealNumbers3": "vec3",
      "RealNumbers4": "vec4",
    }

    const inputSignatureElement = definitionElement.querySelector('.user-function-input-signature');
    const inputSignatureTree = JSON.parse(inputSignatureElement.getValue('math-json'));

    let currentNode = inputSignatureTree;
    const inputSignature = [];
    while (Array.isArray(currentNode)) {
      inputSignature.push(mathjson2glsl[currentNode[1]]);
      currentNode = currentNode[2];
    }
    inputSignature.push(mathjson2glsl[currentNode]);

    const outputSignatureElement = definitionElement.querySelector('.user-function-output-signature');
    const outputSignatureTree = JSON.parse(outputSignatureElement.getValue('math-json'));
    const outputSignature = Array.isArray(outputSignatureTree) ? outputSignatureTree.slice(1).map(node => mathjson2glsl[node]) : [mathjson2glsl[outputSignatureTree]];


    if (inputSignature.length > 1) {
      allSignatures.add(inputSignature.join("_"));
    }

    if (outputSignature.length > 1) {
      allSignatures.add(outputSignature.join("_"));
    }

    functionDeclarations.push({
      equationElement,
      functionSymbol,
      variables,
      inputSignature,
      outputSignature
    });

    symbolsMap[functionSymbol] = {inputSignature, outputSignature};
  }

  return {functionDeclarations, allSignatures};
}

function defineConstants(constantElements) {
  return constantElements.map(constantElement => {
    const symbolElement = constantElement.querySelector('.user-constant-symbol');
    const valueElement = constantElement.querySelector('.user-constant-value');
    const symbolString = JSON.parse(symbolElement.getValue('math-json'));
    const valueString = mj2gl(JSON.parse(valueElement.getValue('math-json')));
    return `#define ${symbolString} ${valueString}`;
  });
}

function generateFunctions(functionDeclarations, allSignatures, definitionElements, equationComputeEngine) {
  const structDeclarationStrings = Array.from(allSignatures).map(structName => `
  struct ${structName} {
    ${structName.split("_").map((type, i) => `${type} argument_${i};`).join('\n    ')}
  };
  `);

  const functionDeclarationStrings = Array.from(allSignatures).map(structName => `
  ${structName} to_tuple(${structName.split("_").map((type, i) => `${type} argument_${i}`).join(', ')}){
    return ${structName}(${structName.split("_").map((type, i) => `argument_${i}`).join(', ')});
  }
  
  `).concat(functionDeclarations.map(({equationElement, functionSymbol, variables, inputSignature, outputSignature}) => `
  ${outputSignature.join("_")} ${functionSymbol}(${variables.map((variable, i) => `${inputSignature[i]} ${variable}`).join(', ')}) {
    return ${mj2gl(JSON.parse(equationElement.getValue('math-json')))};
  }
  `).concat(functionDeclarations.filter(({inputSignature}) => inputSignature.length > 1).map(({equationElement, functionSymbol, variables, inputSignature, outputSignature}) => `
  ${outputSignature.join("_")} ${functionSymbol}(${inputSignature.join("_")} tuple) {
    return ${functionSymbol}(${inputSignature.map((_, i) => `tuple.argument_${i}`).join(", ")});
  }
  `)));

  const iterationDeclarationStrings = iterations.map(({symbol, amount, inputSignature, outputSignature}) => `
  ${outputSignature.join("_")} iterate_${symbol}_${amount}(${inputSignature.join("_")} argument) {
    ${outputSignature.join("_")} value = argument;
    for (int i = 0; i < ${amount}; i++) {
      value = ${symbol}(value);
    }
    return value;
  }
  `).concat(iterations.filter(({inputSignature}) => inputSignature.length > 1).map(({symbol, amount, inputSignature, outputSignature}) => `
  ${outputSignature.join("_")} iterate_${symbol}_${amount}(${inputSignature.map((type, i) => `${type} argument_${i}`).join(", ")}) {
    ${outputSignature.join("_")} value = to_tuple(${inputSignature.map((type, i) => `argument_${i}`).join(",")});
    for (int i = 0; i < ${amount}; i++) {
      value = ${symbol}(value);
    }
    return value;
  }
  `));

  return {structDeclarationStrings, functionDeclarationStrings, iterationDeclarationStrings};
}

function generateGLSL() {
  iterations = [];
  symbolsMap = {};
  const constantElements = Array.from(document.querySelectorAll('.user-constant-definition'));
  const constantDefinitionStrings = defineConstants(constantElements);

  const definitionElements = Array.from(document.querySelectorAll('.user-function-definition')).toReversed();
  const {functionDeclarations, allSignatures} = declareFunctions(definitionElements);

  const equationComputeEngine = new ComputeEngine();

  let declared = new Set();
  for (let {functionSymbol, variables} of functionDeclarations) {
    const symbolString = functionSymbol.charAt(0);
    // let symbolString;
    // if (Array.isArray(functionSymbol)) {
    //   symbolString = functionSymbol[1];
    // } else {
    //   symbolString = functionSymbol.charAt(0);
    // }

    if (!declared.has(symbolString)) {
      equationComputeEngine.declare(symbolString, {
        kind: 'signature',
        args: variables.map(variable => ({type: 'real'})),
        result: 'real',
      });
      declared.add(symbolString);
    }
  }

  MathfieldElement.computeEngine = equationComputeEngine;

  const mathJSON = JSON.parse(brightnessEquationElement.getValue('math-json'));
  const brightnessExpression = mj2gl(mathJSON);
  console.log(mathJSON);

  const {
    structDeclarationStrings,
    functionDeclarationStrings,
    iterationDeclarationStrings
  } = generateFunctions(
    functionDeclarations,
    allSignatures,
    definitionElements,
    equationComputeEngine
  );

  const vertSrc = `
  precision highp float;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aTexCoord;
    vec4 positionVec4 = vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
  }
  `;

  let fragSrc = `
  #define Pi           3.1415926538
  #define ExponentialE 2.7182818284
  ${constantDefinitionStrings.join('\n')}
  
  precision highp float;
  uniform float width;
  uniform float height;
  uniform float time;
  uniform float max_value;
  uniform float min_value;
  uniform float min_x;
  uniform float max_x;
  uniform float min_y;
  uniform float max_y;
  uniform float unit_t;

  ${structDeclarationStrings.join('')}

  float multiply(float left, float right) {
    return left * right;
  }

  vec2 multiply(vec2 left, float right) {
    return right * left;
  }

  vec3 multiply(vec3 left, float right) {
    return right * left;
  }

  vec4 multiply(vec4 left, float right) {
    return right * left;
  }

  vec2 multiply(float left, vec2 right) {
    return left * right;
  }

  vec3 multiply(float left, vec3 right) {
    return left * right;
  }

  vec4 multiply(float left, vec4 right) {
    return left * right;
  }

  float multiply(vec2 left, vec2 right) {
    return dot(left,right);
  }

  float multiply(vec3 left, vec3 right) {
    return dot(left,right);
  }

  float multiply(vec4 left, vec4 right) {
    return dot(left,right);
  }

  float atanh(float x) {
    return 0.5 * (log(1.0 + x) - log(1.0 - x));
  }

  float tanh(float x) {
    return (exp(2.0 * x) - 1.0)/(exp(2.0 * x) + 1.0); 
  }

  ${functionDeclarationStrings.join('')}

  ${iterationDeclarationStrings.join('')}

  float brightness(float x, float y, float t) {
    return ${brightnessExpression};
  }

  void main() {
    float color = brightness(min_x + (max_x - min_x) * gl_FragCoord.x / width, min_y + (max_y - min_y) * gl_FragCoord.y / height, time * unit_t);
    gl_FragColor = vec4(vec3((color - min_value)/(max_value-min_value)), 1.0);
  }
  `;
  console.log(fragSrc);

  return [vertSrc, fragSrc];
}


document.querySelector('#add-user-function-button').onclick = () => {
  const clone = document.querySelector('#user-function-template').content.cloneNode(true);
  const readOnlyUserFunctionSymbol = clone.querySelector('.readonly-user-function-symbol');
  const parentElement = document.querySelector('#user-function-list');

  clone.querySelector('.user-function-symbol').oninput = (e) => readOnlyUserFunctionSymbol.innerText = e.target.value;
  clone.querySelector('.left-button').onclick = (e) => {
    e.target.parentElement.parentElement.previousElementSibling?.before(e.target.parentElement.parentElement);
  }
  clone.querySelector('.right-button').onclick = (e) => {
    e.target.parentElement.parentElement.nextElementSibling?.after(e.target.parentElement.parentElement);
  }
  parentElement.appendChild(clone);
};

document.querySelector('#add-user-constant-button').onclick = () => {
  const clone = document.querySelector('#user-constant-template').content.cloneNode(true);
  const parentElement = document.querySelector('#user-constant-list');
  parentElement.appendChild(clone);
}

new p5(sketch);

