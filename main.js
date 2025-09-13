const nodeMode = ["localhost", "127.0.0.1"].includes(window.location.hostname) && !window.navigator.onLine;
let ComputeEngine;
let MathfieldElement;
if (nodeMode) {
  Promise.all([
    import("./node_modules/@cortex-js/compute-engine/dist/compute-engine.esm.js"),
    import("./node_modules/p5/lib/p5.esm.js"),
    import("./node_modules/mathlive/mathlive.min.mjs"),
  ]).then(([{ComputeEngine: ce}, {default: p}, {MathfieldElement: me}]) => {
    onModuleLoad(ce, p, me);
  })
} else {
  Promise.all([
    import("https://unpkg.com/@cortex-js/compute-engine@0.30.2?module"),
    import("https://cdn.jsdelivr.net/npm/p5@2.0.4/lib/p5.esm.js"),
    import("https://unpkg.com/mathlive@0.107.0?module"),
  ]).then(([{ComputeEngine: ce}, {default: p}, {MathfieldElement: me}]) => {
    onModuleLoad(ce, p, me);
  })
}

function onModuleLoad(ce, p, me) {
  ComputeEngine = ce;
  MathfieldElement = me;

  const url  = new URL(window.location.href);
  const example = url.searchParams.get("example");
  if (example) {
    loadExample(example);
  }
  const data = url.searchParams.get("data");
  if (data) {
    loadEquationsFromObject(JSON.parse(base64Decode(data)));
  }

  new p(sketch);
}

const side = 256;

const reverseMapping = mapping => Object.fromEntries(
  Object.entries(mapping).map(([a,b]) => [b,a])
);

const topLevelMap = {
  "settings": "a",
  "functions": "b",
  "constants": "c",
}

const configSelectorsMap = {
  "#min-value": "a",
  "#max-value": "b",
  "#min-x": "c",
  "#max-x": "d",
  "#min-y": "e",
  "#max-y": "f",
  "#unit-t": "g",
  "#equation": "h",
};
const configSelectorsReverseMap = reverseMapping(configSelectorsMap);
const configSelectors = Object.keys(configSelectorsMap);

const functionSelectorsMap = {
  ".user-function-symbol": "a",
  ".user-function-input-signature": "b",
  ".user-function-output-signature": "c",
  ".user-function-inputs": "d",
  ".user-function-equation": "e",
  ".readonly-user-function-symbol": "f",
};
const functionSelectorsReverseMap = reverseMapping(functionSelectorsMap);
const functionSelectors = Object.keys(functionSelectorsMap);

const constantSelectorsMap = {
  ".user-constant-symbol": "a",
  ".user-constant-value": "b",
};
const constantSelectorsReverseMap = reverseMapping(constantSelectorsMap);
const constantSelectors = Object.keys(constantSelectorsMap);

const equationInlineShortcuts = {
  "[": "\\llbracket",
  "]": "\\rrbracket",
}

const brightnessEquationElement = document.querySelector("#equation");
brightnessEquationElement.inlineShortcuts = {
  ...brightnessEquationElement.inlineShortcuts,
  ...equationInlineShortcuts,
};

let objIterations = {};
let symbolsMap = {};

let t0;
let s;

let animate;

let sketch = p5 => {
  p5.setup = () => {
    p5.createCanvas(side, side, p5.WEBGL);
    p5.pixelDensity(1);
    p5.noStroke();
    p5.frameRate(20);
    p5.background("white");
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.text("Loading...", p5.width / 2, p5.height / 2);
    p5.describe("An animation written with math.");

    const animateButton = p5.select("#animate-button");
    animate = () => {
      try {
        s = p5.createShader(...generateGLSL());
        p5.shader(s);
        s.setUniform("width", side);
        s.setUniform("height", side);
        s.setUniform("min_value",
          document.querySelector("#min-value").expression.compile()());
        s.setUniform("max_value",
          document.querySelector("#max-value").expression.compile()());
        s.setUniform("min_x",
          document.querySelector("#min-x").expression.compile()());
        s.setUniform("max_x",
          document.querySelector("#max-x").expression.compile()());
        s.setUniform("min_y",
          document.querySelector("#min-y").expression.compile()());
        s.setUniform("max_y",
          document.querySelector("#max-y").expression.compile()());
        s.setUniform("unit_t",
          document.querySelector("#unit-t").expression.compile()());
        t0 = p5.millis();
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
      s.setUniform("time", (p5.millis() - t0) / 1000)
      try {
        p5.plane(side, side);
      } catch (e) {
        s = null;
        console.error(e);
      }
    } else {
      p5.background("red");
    }
  }
}

const operationDict = {
  "Cos": node => `cos(${mj2gl(node[1])})`,
  "Sin": node => `sin(${mj2gl(node[1])})`,
  "Sqrt": node => `sqrt(${mj2gl(node[1])})`,
  "Floor": node => `floor(${mj2gl(node[1])})`,
  "Ceil": node => `ceil(${mj2gl(node[1])})`,
  "Abs": node => `abs(${mj2gl(node[1])})`,
  "Power": node => Number.isInteger(node[2]) && node[2] < 5 ?
  mj2gl(["Multiply",...(new Array(node[2])).fill(node[1])]) :
  `pow(${mj2gl(node[1])}, ${mj2gl(node[2])})`,
  "Complex": node => `complex(${mj2gl(node[1])}, ${mj2gl(node[2])}, false)`,
  "Re": node => `real_part(${mj2gl(node[1])})`,
  "Add": node => node.length === 3 ?
  `add(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `add(${mj2gl(node[1])}, ${mj2gl(["Add", ...node.slice(2)])})`,
  "Negate": node => `negate(${mj2gl(node[1])})`,
  "Multiply": node => node.length === 3 ?
  `multiply(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `multiply(${mj2gl(node[1])}, ${mj2gl(["Multiply", ...node.slice(2)])})`,
  "Norm": node => `length(${mj2gl(node[1])})`,
  "Divide": node => `divide(${mj2gl(node[1])}, ${mj2gl(node[2])})`,
  "Rational": node => `(${mj2gl(node[1])} / ${mj2gl(node[2])})`,
  "Mod": node => `mod(${mj2gl(node[1])}, ${mj2gl(node[2])})`,
  "Min": node => node.length === 3 ?
  `min(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `min(${mj2gl(node[1])}, ${mj2gl(["Min", ...node.slice(2)])})`,
  "Max": node => node.length === 3 ?
  `max(${mj2gl(node[1])}, ${mj2gl(node[2])})` :
  `max(${mj2gl(node[1])}, ${mj2gl(["Max", ...node.slice(2)])})`,
  "Boole": node => `float(${mj2gl(node[1])})`,
  "Less": node => `(${mj2gl(node[1])} < ${mj2gl(node[2])})`,
  "LessEqual": node => `(${mj2gl(node[1])} <= ${mj2gl(node[2])})`,
  "Equal": node => `(${mj2gl(node[1])} == ${mj2gl(node[2])})`,
  "Matrix": node =>
  `vec${node[1].length - 1}(${node[1].slice(1).map(entry => mj2gl(entry[1]))})`,
  "Subscript": node => `${mj2gl(node[1])}_${mj2gl(node[2])}`,
  "Apply": node => `${mj2gl(node[1])}(${node.slice(2).map(mj2gl).join(",")})`,
  "Tuple": node => {
    if (node?.[1]?.[0] === "Power") {
      const functionSymbol = node[1][1]?.[0] === "Subscript" ?
        `${node[1][1][1]}_${node[1][1][2]}`: node[1][1];
      if (!Object.hasOwn(objIterations, functionSymbol)) {
        objIterations[functionSymbol] = []
      }
      objIterations[functionSymbol].push({
        symbol: functionSymbol,
        amount: node[1][2][2],
        ...symbolsMap[functionSymbol]
      });
      if (node?.[2]?.[0] === "Tuple") {
        let inputs = node[2].slice(1).map(
          (child, index) =>
          symbolsMap[functionSymbol].inputSignature[index] === "complex" ?
          `injection_map(${mj2gl(child)})` :
          mj2gl(child))
        return `iterate_${functionSymbol}_${node[1][2][2]}(${inputs.join(",")})`;
      }
      let input = symbolsMap[functionSymbol].inputSignature[0] === "complex" ?
        `injection_map(${mj2gl(node[2])})` : mj2gl(node[2]);
      return `iterate_${functionSymbol}_${node[1][2][2]}(${input})`;
    }
    return "to_tuple(" + node.slice(1).map(mj2gl).join(",") + ")";
  }
}

function mj2gl(node) {
  if (Array.isArray(node)) {
    if (node[0] in operationDict) {
      return operationDict[node[0]](node);
    } else {
      if (node[0] === "Error") {
        return node;
      } else if (!symbolsMap[node[0]]) {
        return `ERROR(${node[0]} is not defined)`;
      } else {
        return node[0]+"(" + node.slice(1).map((child, index) =>
          symbolsMap[node[0]].inputSignature[index] === "complex" &&
          symbolsMap[node[0]].inputSignature.length === node.slice(1).length ?
          `injection_map(${mj2gl(child)})` :
          mj2gl(child)).join(",") + ")";
      }
    }
  } else if (typeof node === "number"){
    const strRep = node.toString();
    return `float_identity(${strRep.includes(".") ? strRep : strRep + ".0"})`;
  } else if (["x","y","t","Pi","ExponentialE"].includes(node)){
    return node;
  } else {
    return node;
  }
}

function declareFunctions(definitionElements) {
  const computeEngine = new ComputeEngine();

  const cartesianProductSymbol = {
    name: "CartesianProduct",
    latexTrigger: ["\\times"],
    kind: "infix",
    associativity: "right", 
    precedence: 390,
  };

  const r2Symbol = {
    name: "RealNumbers2",
    latexTrigger: ["\\R^2"],
    kind: "expression",
  };

  const r3Symbol = {
    name: "RealNumbers3",
    latexTrigger: ["\\R^3"],
    kind: "expression",
  };

  const r4Symbol = {
    name: "RealNumbers4",
    latexTrigger: ["\\R^4"],
    kind: "expression",
  };

  computeEngine.latexDictionary = computeEngine.latexDictionary.concat([
    cartesianProductSymbol, r2Symbol, r3Symbol, r4Symbol,
  ]);
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
    const symbolElement =
      definitionElement.querySelector(".user-function-symbol");
    const equationElement =
      definitionElement.querySelector(".user-function-equation");
    const inputsElement =
      definitionElement.querySelector(".user-function-inputs");
    const functionSymbol =
      parseFunctionSymbol(JSON.parse(symbolElement.getValue("math-json")));
    const functionInputs =
      JSON.parse(inputsElement.getValue("math-json"));
    const variables =
      Array.isArray(functionInputs) ? functionInputs.slice(1) : [functionInputs];

    const mathjson2glsl = {
      "RealNumbers": "float",
      "ComplexNumbers": "complex",
      "RealNumbers2": "vec2",
      "RealNumbers3": "vec3",
      "RealNumbers4": "vec4",
      "R__3_doublestruck": "vec3",
    }

    const inputSignatureElement =
      definitionElement.querySelector(".user-function-input-signature");
    const inputSignatureTree =
      JSON.parse(inputSignatureElement.getValue("math-json"));
    let currentNode = inputSignatureTree;
    const inputSignature = [];
    while (Array.isArray(currentNode)) {
      inputSignature.push(mathjson2glsl[currentNode[1]]);
      currentNode = currentNode[2];
    }
    inputSignature.push(mathjson2glsl[currentNode]);

    const outputSignatureElement =
      definitionElement.querySelector(".user-function-output-signature");
    const outputSignatureTree =
      JSON.parse(outputSignatureElement.getValue("math-json"));
    currentNode = outputSignatureTree;
    const outputSignature = [];
    while (Array.isArray(currentNode)) {
      outputSignature.push(mathjson2glsl[currentNode[1]]);
      currentNode = currentNode[2];
    }
    outputSignature.push(mathjson2glsl[currentNode]);

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
    const symbolElement = constantElement.querySelector(".user-constant-symbol");
    const valueElement = constantElement.querySelector(".user-constant-value");
    const symbolString = JSON.parse(symbolElement.getValue("math-json"));
    const valueString = mj2gl(JSON.parse(valueElement.getValue("math-json")));
    return `
  #define ${symbolString} ${valueString}`;
  });
}

function generateFunctions(
  functionDeclarations,
  allSignatures,
  definitionElements,
  equationComputeEngine,
) {
  const structDeclarationStrings = Array.from(allSignatures).map(structName => `
struct ${structName} {
  ${structName.split("_").map((type, i) => `${type} arg${i};`).join("\n    ")}
};`
  );

  const functionDeclarationStrings = Array.from(allSignatures).map(structName => `
    ${structName} to_tuple(${structName.split("_").map((type, i) => `${type} arg${i}`).join(", ")}){
  return ${structName}(${structName.split("_").map((type, i) => `arg${i}`).join(", ")});
}`
  ).concat(functionDeclarations.toReversed()
    .map(({
      equationElement,
      functionSymbol,
      variables,
      inputSignature,
      outputSignature,
    }) => {
      const math = mj2gl(JSON.parse(equationElement.getValue("math-json")))
      return (`
        ${outputSignature.join("_")} ${functionSymbol}(${
          variables.map((variable, i) => `${inputSignature[i]} ${variable}`).join(", ")
        }) {
  return ${math};
}` + (inputSignature.length > 1 ? `
  ${outputSignature.join("_")} ${functionSymbol}(${inputSignature.join("_")} tuple) {
  return ${functionSymbol}(${inputSignature.map((_, i) => `tuple.arg${i}`).join(", ")});
}` : "") + (Object.hasOwn(objIterations, functionSymbol) ?
  (objIterations[functionSymbol].map(({symbol, amount}) => `
    ${outputSignature.join("_")} iterate_${symbol}_${amount}(${inputSignature.join("_")} arg) {
  ${outputSignature.join("_")} value = arg;
  for (int i = 0; i < ${amount}; i++) {
    value = ${symbol}(value);
  }
  return value;
}` + (inputSignature.length > 1 ? `
  ${outputSignature.join("_")} iterate_${symbol}_${amount}(${
    inputSignature.map((type, i) => `${type} arg${i}`).join(", ")
  }) {
  ${outputSignature.join("_")} value = to_tuple(${inputSignature.map((type, i) => `arg${i}`).join(",")});
  for (int i = 0; i < ${amount}; i++) {
    value = ${symbol}(value);
  }
  return value;
}` : ""))).join("") : ""))
    }).toReversed());

  const iterationDeclarationStrings = [];

  return {structDeclarationStrings, functionDeclarationStrings, iterationDeclarationStrings};
}

function generateGLSL() {
  objIterations = {};
  symbolsMap = {};

  const constantElements =
    Array.from(document.querySelectorAll(".user-constant-definition"));
  const constantDefinitionStrings = defineConstants(constantElements);

  const definitionElements =
    Array.from(document.querySelectorAll(".user-function-definition")).toReversed();
  const {functionDeclarations, allSignatures} = declareFunctions(definitionElements);

  const equationComputeEngine = new ComputeEngine();

  let declared = new Set();
  for (let {functionSymbol, variables} of functionDeclarations) {
    const symbolString = functionSymbol.charAt(0);

    if (!declared.has(symbolString)) {
      equationComputeEngine.declare(symbolString, `(x:any)->number`);
      declared.add(symbolString);
    }
  }
  equationComputeEngine.declare("Re", `(x:any)->number`);

  const iSymbol = {
    name: "CustomImaginaryUnit",
    latexTrigger: "i",
    kind: "symbol",
  };

  equationComputeEngine.latexDictionary =
    equationComputeEngine.latexDictionary.filter(a => a.parse !== "ImaginaryUnit");
  equationComputeEngine.latexDictionary =
    equationComputeEngine.latexDictionary.concat([iSymbol]);

  equationComputeEngine.declare("CustomImaginaryUnit", "number");

  MathfieldElement.computeEngine = equationComputeEngine;

  const mathJSON = JSON.parse(brightnessEquationElement.getValue("math-json"));
  const brightnessExpression = mj2gl(mathJSON);

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
#define CustomImaginaryUnit complex(0.0, 1.0)
  ${constantDefinitionStrings.join("")}

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

struct complex {
  float re;
  float im;
};
${structDeclarationStrings.join("")}

float float_identity(float x) {
  return x;
}
float real_part(float x) {
  return x;
}
float real_part(complex z) {
  return z.re;
}
complex injection_map(float x) {
  return complex(x, 0.0);
}
complex injection_map(complex z) {
  return z;
}
float abs(complex z) {
  return sqrt(z.re * z.re + z.im * z.im);
}
complex negate(complex z) {
  return complex(-z.re, -z.im);
}
float negate(float x) {
  return -1. * x;
}
vec2 negate(vec2 v) {
  return -1. * v;
}
vec3 negate(vec3 v) {
  return -1. * v;
}
vec4 negate(vec4 v) {
  return -1. * v;
}
complex add(float left, complex right) {
  return complex(left + right.re, right.im);
}
complex add(complex left, float right) {
  return complex(right + left.re, left.im);
}
complex add(complex left, complex right) {
  return complex(left.re + right.re, left.im + right.im);
}
float add(float left, float right) {
  return left + right;
}
vec2 add(vec2 left, vec2 right) {
  return left+right;
}
vec3 add(vec3 left, vec3 right) {
  return left+right;
}
vec4 add(vec4 left, vec4 right) {
  return left+right;
}
complex multiply(complex left, float right) {
  return complex(right * left.re, right * left.im);
}
complex multiply(float left, complex right) {
  return complex(left * right.re, left * right.im);
}
complex multiply(complex left, complex right) {
  return complex(
    left.re * right.re - left.im * right.im,
    left.re * right.im + left.im * right.re
  );
}
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
vec3 divide(vec3 left, float right) {
  return left / right;
}
complex divide(complex left, float right) {
  return complex(left.re / right, left.im / right);
}
complex divide(float left, complex right) {
  return complex(
    right.re * left        / (right.re * right.re + right.im * right.im),
    -1.0 * right.im * left / (right.re * right.re + right.im * right.im)
  );
}
complex divide(complex left, complex right) {
  return complex(
    (left.re * right.re + left.im * right.im) /
      (right.re * right.re + right.im * right.im),
    (left.im * right.re - left.re * right.im) /
      (right.re * right.re + right.im * right.im)
  );
}
float divide(float left, float right) {
  return left / right;
}
float atanh(float x) {
  return 0.5 * (log(1.0 + x) - log(1.0 - x));
}
float tanh(float x) {
  return (exp(2.0 * x) - 1.0)/(exp(2.0 * x) + 1.0); 
}
${functionDeclarationStrings.join("")}
${iterationDeclarationStrings.join("")}

float brightness(float x, float y, float t) {
  return ${brightnessExpression};
}

void main() {
  float x_value = min_x + (max_x - min_x) * gl_FragCoord.x / width;
  float y_value = min_y + (max_y - min_y) * gl_FragCoord.y / height;
  float color = brightness(x_value, y_value, time * unit_t);
  gl_FragColor = vec4(vec3((color - min_value)/(max_value-min_value)), 1.0);
}
`;
  console.log(fragSrc.split("\n").map((line, index) =>
    (index + 1).toString().padStart(3, " ") + line
  ).join("\n"));

  return [vertSrc, fragSrc];
}

const clearDefinitionAndConstantElements = () => {
  const definitionParentElement = document.querySelector("#user-function-list");
  while (definitionParentElement?.lastChild?.nodeName !== "TEMPLATE") {
    definitionParentElement.removeChild(definitionParentElement.lastChild);
  }
  const constantParentElement = document.querySelector("#user-constant-list");
  while (constantParentElement?.lastChild?.nodeName !== "TEMPLATE") {
    constantParentElement.removeChild(constantParentElement.lastChild);
  }
}

const createNewFunctionDefinitionElement = () => {
  const clone =
    document.querySelector("#user-function-template").content.cloneNode(true);
  const readOnlyUserFunctionSymbol =
    clone.querySelector(".readonly-user-function-symbol");
  const parentElement =
    document.querySelector("#user-function-list");
  const inputSignatureMathfield =
    clone.querySelector(".user-function-input-signature");
  const outputSignatureMathfield =
    clone.querySelector(".user-function-output-signature");
  const userEquationMathfield = clone.querySelector(".user-function-equation");
  clone.querySelector(".user-function-symbol")
    .oninput = (e) => readOnlyUserFunctionSymbol.innerText = e.target.value;
  clone.querySelector(".remove-button").onclick = (e) => {
    e.target.closest(".user-function-definition").remove();
  }
  const setupElement = () => {
    userEquationMathfield.inlineShortcuts = {
      ...userEquationMathfield.inlineShortcuts,
      ...equationInlineShortcuts,
    };
    const signatureInlineShortcuts = {
      "*": "\\times",
      "c": "\\C",
      "C": "\\C",
      "r": "\\R",
      "R": "\\R",
    };
    inputSignatureMathfield.inlineShortcuts = {
      ...inputSignatureMathfield.inlineShortcuts,
      ...signatureInlineShortcuts,
    };
    outputSignatureMathfield.inlineShortcuts = {
      ...outputSignatureMathfield.inlineShortcuts,
      ...signatureInlineShortcuts,
    };
  }
  clone.querySelector(".left-button").onclick = (e) => {
    e.target.closest(".user-function-definition")
      .previousElementSibling
      ?.before(e.target.closest(".user-function-definition"));
    setupElement();
  }
  clone.querySelector(".right-button").onclick = (e) => {
    e.target.closest(".user-function-definition")
      .nextElementSibling
      ?.after(e.target.closest(".user-function-definition"));
    setupElement();
  }
  parentElement.appendChild(clone);
  setupElement();
  document.querySelectorAll("math-field[readonly]").forEach(mf => mf.tabIndex = -1);
  return parentElement.lastElementChild;
};

document.querySelector("#add-user-function-button").onclick = () => {
  createNewFunctionDefinitionElement();
};

const createNewConstantDefinitionElement = () => {
  const clone = document.querySelector("#user-constant-template")
    .content.cloneNode(true);
  const parentElement = document.querySelector("#user-constant-list");
  clone.querySelector(".remove-button").onclick = (e) => {
    e.target.closest(".user-constant-definition").remove();
  }
  clone.querySelector(".left-button").onclick = (e) => {
    e.target.closest(".user-constant-definition")
      .previousElementSibling
      ?.before(e.target.closest(".user-constant-definition"));
  }
  clone.querySelector(".right-button").onclick = (e) => {
    e.target.closest(".user-constant-definition")
      .nextElementSibling
      ?.after(e.target.closest(".user-constant-definition"));
  }
  parentElement.appendChild(clone);
  document.querySelectorAll("math-field[readonly]")
    .forEach(mf => mf.tabIndex = -1);
  return parentElement.lastElementChild;
};

document.querySelector("#add-user-constant-button").onclick = () => {
  createNewConstantDefinitionElement();
};

function convertToJSON() {
  const settingsEntries = configSelectors.map(
    selector => [
      configSelectorsMap[selector],
      document.querySelector(selector).value
    ]
  );
  const settings = Object.fromEntries(settingsEntries);
  const functions = Array.from(
    document.querySelectorAll(".user-function-definition")
  ).map(definitionElement => 
    Object.fromEntries(
      functionSelectors.map(selector =>
        [
          functionSelectorsMap[selector],
          definitionElement.querySelector(selector).value
        ]
      )
    )
  );
  const constants = Array.from(
    document.querySelectorAll(".user-constant-definition")
  ).map(definitionElement =>
    Object.fromEntries(
      constantSelectors.map(selector =>
        [
          constantSelectorsMap[selector],
          definitionElement.querySelector(selector).value
        ]
      )
    )
  );
  const topLevelEntries = [
    [topLevelMap["settings"], settings],
    [topLevelMap["functions"], functions],
    [topLevelMap["constants"], constants],
  ];
  return JSON.stringify(Object.fromEntries(topLevelEntries));
}

document.querySelector("#save-button").onclick = () => {
  const content = convertToJSON();
  const a = document.createElement("a");
  const file = new Blob([content], {type: "text/plain"});
  a.href = URL.createObjectURL(file);
  a.download = "equation-shader.json";
  a.click();
};


async function loadExample(example) {
  const examplesPath = "/examples/";
  const valueToExampleFile = {
    "mandelbrot": "mandelbrot.json",
    "julia": "julia.json",
    "ray-tracing-1": "ray-tracing-1.json",
    "ray-tracing-2": "ray-tracing-2.json",
  }

  const exampleFile = valueToExampleFile?.[example];

  if (!exampleFile) {
    // todo error management
    return;
  }

  document.querySelector("#load-example").value = example;

  const response = await fetch(examplesPath + exampleFile);
  if (!response.ok) {
    // todo handle error
    return;
  }
  const data = await response.json();
  loadEquationsFromObject(data);
  animate();
}

function loadEquationsFromObject(data) {
  clearDefinitionAndConstantElements();
  for (let id of configSelectors) {
    document.querySelector(id).value =
      data?.[topLevelMap["settings"]]?.[configSelectorsMap[id]];
  }
  if (Array.isArray(data?.[topLevelMap["functions"]])) {
    for (let functionData of data?.[topLevelMap["functions"]]) {
      const newDefinitionElement = createNewFunctionDefinitionElement();
      for (let functionSelector of functionSelectors) {
        newDefinitionElement.querySelector(functionSelector).value =
          functionData?.[functionSelectorsMap[functionSelector]];
      }
    }
  }
  if (Array.isArray(data?.[topLevelMap["constants"]])) {
    for (let constantData of data?.[topLevelMap["constants"]]) {
      const newDefinitionElement = createNewConstantDefinitionElement();
      for (let constantSelector of constantSelectors) {
        newDefinitionElement.querySelector(constantSelector).value =
          constantData?.[constantSelectorsMap[constantSelector]];
      }
    }
  }
}

function base64Encode(s) {
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_");
}

function base64Decode(s) {
  return atob(s.replaceAll("-", "+").replaceAll("_", "/"));
}

document.querySelector("#copy-url-button").onclick = e => {
  const content = convertToJSON();
  const encodedContent = base64Encode(content);
  const urlWithData = window.location.origin + window.location.pathname + "?data=" + encodedContent;
  navigator.clipboard.writeText(urlWithData);
  const originalText = e.target.innerText;
  e.target.innerText = "URL with equation data copied!";
  setTimeout(() => {
    e.target.innerText = originalText;
  }, 3000);
}

document.querySelector("#load-example").onchange = async e => {
  if (e.target.value === "") {
    return;
  }

  if (!window.confirm(
    "Loading an example will delete all equations on the page. " +
    "Are you sure you want to load an example?"
  )) {
    e.target.value = "";
    return;
  }

  window.location.replace(
    window.location.origin + window.location.pathname + "?example=" + e.target.value
  );
};

document.querySelector("#load-button").onclick = () => {
  if (!window.confirm(
    "Loading a file will delete all equations on the page. " +
    "Are you sure you want to load a new file?"
  )) {
    return;
  }
  let input = document.createElement("input");
  input.type = "file";
  input.multiple = false;
  input.accept = "application/json";
  input.onchange = () => {
    const file = Array.from(input.files)?.[0];
    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = readerEvent => {
      loadEquationsFromObject(JSON.parse(readerEvent.target.result));
      animate();
    }
  }
  input.click();
};

document.querySelectorAll("math-field[readonly]").forEach(mf => mf.tabIndex = -1);

