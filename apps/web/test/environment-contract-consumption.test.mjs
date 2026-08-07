import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import nodeTest from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const isDirectTestExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
const test = isDirectTestExecution ? nodeTest : () => {};

const srcRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

// These are the only frontend modules allowed to read the deployment environment
// directly. config.ts resolves browser runtime values through the central contract;
// vite.config.ts validates build/server values through that same contract.
const AUTHORIZED_ENVIRONMENT_READERS = new Set([
  "apps/web/src/config.ts",
  "apps/web/vite.config.ts",
]);
const PURPOSE_LIMITED_ENVIRONMENT_READERS = Object.freeze({
  "apps/web/src/pages/LoginPage.tsx": "DEV",
  "apps/web/src/lib/stripe.ts": "VITE_STRIPE_PUBLISHABLE_KEY",
});

function canonicalRepositoryPath(file) {
  const rawFile = String(file);
  const hasForeignSeparators = path.sep !== "\\" && rawFile.includes("\\");
  const normalizedFile = rawFile.replaceAll("\\", "/");
  const hasTraversal = normalizedFile.split("/").some((segment) => segment === "." || segment === "..");
  const absoluteFile = path.isAbsolute(normalizedFile)
    ? path.resolve(normalizedFile)
    : path.resolve(repositoryRoot.pathname, normalizedFile);
  const repositoryPath = path.relative(repositoryRoot.pathname, absoluteFile).split(path.sep).join("/");
  const outsideRepository = repositoryPath === ".."
    || repositoryPath.startsWith("../")
    || path.isAbsolute(repositoryPath);
  return {
    repositoryPath,
    authorizedPath: !hasForeignSeparators && !hasTraversal && !outsideRepository,
  };
}

function scriptKindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function unwrapExpression(node) {
  while (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isPartiallyEmittedExpression(node)
  ) node = node.expression;
  return node;
}

function isImportMeta(node) {
  const expression = unwrapExpression(node);
  return ts.isMetaProperty(expression)
    && expression.keywordToken === ts.SyntaxKind.ImportKeyword
    && expression.name.text === "meta";
}

function isDirectPurposeRead(node, expectedName) {
  const outer = unwrapExpression(node);
  if (!ts.isPropertyAccessExpression(outer) || outer.name.text !== expectedName) return false;
  const environment = unwrapExpression(outer.expression);
  return ts.isPropertyAccessExpression(environment)
    && environment.name.text === "env"
    && isImportMeta(environment.expression);
}

function isNonReferenceIdentifier(node) {
  const parent = node.parent;
  return (ts.isVariableDeclaration(parent) && parent.name === node)
    || (ts.isParameter(parent) && parent.name === node)
    || (ts.isFunctionDeclaration(parent) && parent.name === node)
    || (ts.isClassDeclaration(parent) && parent.name === node)
    || (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isPropertyDeclaration(parent) && parent.name === node)
    || (ts.isMethodDeclaration(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node))
    || (ts.isImportClause(parent) && parent.name === node)
    || (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node))
    || (ts.isNamespaceImport(parent) && parent.name === node)
    || (ts.isShorthandPropertyAssignment(parent) && parent.name === node);
}

function parseWithBindings(source, file, parserMode = "auto") {
  const basename = path.basename(file);
  const virtualBasename = parserMode === "script" && basename.endsWith(".mjs")
    ? `${basename.slice(0, -4)}.js`
    : basename;
  const virtualFile = `/scanner/${virtualBasename}`;
  const options = {
    allowJs: true,
    checkJs: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleDetection: parserMode === "script"
      ? ts.ModuleDetectionKind.Legacy
      : ts.ModuleDetectionKind.Force,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (candidate) => candidate === virtualFile;
  host.readFile = (candidate) => candidate === virtualFile ? source : undefined;
  host.getSourceFile = (candidate, languageVersion) => candidate === virtualFile
    ? ts.createSourceFile(candidate, source, languageVersion, true, scriptKindFor(file))
    : undefined;
  host.writeFile = () => {};
  const program = ts.createProgram([virtualFile], options, host);
  return { sourceFile: program.getSourceFile(virtualFile), checker: program.getTypeChecker() };
}

function staticString(node) {
  const expression = unwrapExpression(node);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const substitution = staticString(span.expression);
      if (substitution === undefined) return undefined;
      value += substitution + span.literal.text;
    }
    return value;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(expression.left);
    const right = staticString(expression.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const target = unwrapExpression(expression.expression.expression);
    if (expression.expression.name.text === "join" && ts.isArrayLiteralExpression(target)) {
      const separator = expression.arguments.length ? staticString(expression.arguments[0]) : ",";
      const values = target.elements.map(staticString);
      return separator === undefined || values.includes(undefined) ? undefined : values.join(separator);
    }
  }
  return undefined;
}

function accessedProperty(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) return staticString(node.argumentExpression);
  return undefined;
}

export function findEnvironmentSelectionBypasses(source, file = "source.ts", purposeRead, parserMode) {
  const { sourceFile, checker } = parseWithBindings(source, file, parserMode);
  const allowedRanges = [];

  if (purposeRead) {
    const collectAllowed = (node) => {
      if (isDirectPurposeRead(node, purposeRead)) {
        allowedRanges.push([node.getStart(sourceFile), node.getEnd()]);
        return;
      }
      ts.forEachChild(node, collectAllowed);
    };
    collectAllowed(sourceFile);
  }

  const insideAllowedRead = (node) => {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    return allowedRanges.some(([allowedStart, allowedEnd]) => start >= allowedStart && end <= allowedEnd);
  };
  const capabilityEvents = new Map();
  const symbolFor = (identifier) => {
    if (identifier.parent
      && ts.isShorthandPropertyAssignment(identifier.parent)
      && identifier.parent.name === identifier) {
      return checker.getShorthandAssignmentValueSymbol(identifier.parent)
        || checker.getSymbolAtLocation(identifier);
    }
    return checker.getSymbolAtLocation(identifier);
  };
  const isBindingName = (identifier, name) => {
    if (!name) return false;
    if (ts.isIdentifier(name)) return name === identifier;
    return name.elements.some((element) => !ts.isOmittedExpression(element)
      && isBindingName(identifier, element.name));
  };
  const declarationScope = (identifier) => {
    let declaration = identifier.parent;
    while (ts.isBindingElement(declaration.parent)) declaration = declaration.parent;
    if (ts.isVariableDeclaration(declaration)) {
      const blockScoped = Boolean(declaration.parent.flags & ts.NodeFlags.BlockScoped);
      for (let current = declaration.parent; current; current = current.parent) {
        if (blockScoped && (ts.isBlock(current) || ts.isSourceFile(current) || ts.isCaseBlock(current))) {
          return current;
        }
        if (!blockScoped && (ts.isFunctionLike(current) || ts.isSourceFile(current))) return current;
      }
    }
    if (ts.isParameter(declaration)) return declaration.parent;
    for (let current = declaration.parent; current; current = current.parent) {
      if (ts.isBlock(current) || ts.isSourceFile(current)) return current;
    }
    return sourceFile;
  };
  const localBindings = new Map();
  const collectLocalBindings = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const declarationName = (ts.isVariableDeclaration(parent)
        || ts.isParameter(parent)
        || ts.isFunctionDeclaration(parent)
        || ts.isFunctionExpression(parent)
        || ts.isClassDeclaration(parent)
        || ts.isClassExpression(parent)) && isBindingName(node, parent.name)
        || ts.isBindingElement(parent) && isBindingName(node, parent.name)
        || ts.isImportClause(parent) && parent.name === node
        || ts.isImportSpecifier(parent) && parent.name === node
        || ts.isNamespaceImport(parent) && parent.name === node;
      if (declarationName) {
        const declarations = localBindings.get(node.text) || [];
        declarations.push({ identifier: node, scope: declarationScope(node) });
        localBindings.set(node.text, declarations);
      }
    }
    ts.forEachChild(node, collectLocalBindings);
  };
  collectLocalBindings(sourceFile);
  const isInside = (node, ancestor) => {
    for (let current = node; current; current = current.parent) {
      if (current === ancestor) return true;
    }
    return false;
  };
  const hasLocalBinding = (identifier) => Boolean(identifier && localBindings.get(identifier.text)?.some(
    (declaration) => isInside(identifier, declaration.scope),
  ));
  const isLocallyBound = (symbol, identifier) => hasLocalBinding(identifier) || Boolean(symbol?.declarations?.some(
    (declaration) => declaration.getSourceFile() === sourceFile,
  ));
  const capabilityAt = (symbol, position) => {
    const events = capabilityEvents.get(symbol);
    if (!events) return undefined;
    let capability;
    for (const event of events) {
      if (event.position > position) break;
      capability = event.capability;
    }
    return capability;
  };
  const setCapability = (identifier, capability, position = identifier.getStart(sourceFile)) => {
    if (!ts.isIdentifier(identifier)) return false;
    const symbol = symbolFor(identifier);
    if (!symbol) return false;
    const events = capabilityEvents.get(symbol) || [];
    const existing = events.find((event) => event.position === position);
    if (existing && existing.capability === capability) return false;
    if (!existing && capability === undefined && capabilityAt(symbol, position) === undefined) return false;
    if (existing) existing.capability = capability;
    else {
      events.push({ position, capability });
      events.sort((left, right) => left.position - right.position);
      capabilityEvents.set(symbol, events);
    }
    return true;
  };
  const expressionCapability = (node) => {
    if (!node || insideAllowedRead(node)) return undefined;
    const expression = unwrapExpression(node);
    if (isImportMeta(expression)) return "environment";
    if (ts.isIdentifier(expression)) {
      const symbol = symbolFor(expression);
      if (expression.text === "process" && !isLocallyBound(symbol, expression)) return "process";
      if (expression.text === "globalThis" && !isLocallyBound(symbol, expression)) return "globalThis";
      if (symbol) return capabilityAt(symbol, expression.getStart(sourceFile));
      return undefined;
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const rootCapability = expressionCapability(expression.expression);
      const projectedCapability = projectedMemberCapability(rootCapability);
      if (projectedCapability) return projectedCapability;
      if (rootCapability === "globalThis") {
        const property = accessedProperty(expression);
        if (property === "process") return "process";
        if (property === "globalThis") return "globalThis";
        return undefined;
      }
      return rootCapability === "process" || rootCapability === "environment"
        ? rootCapability
        : rootCapability === "unknown" ? "unknown"
        : undefined;
    }
    if (
      ts.isBinaryExpression(expression)
      && (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        || expression.operatorToken.kind === ts.SyntaxKind.CommaToken)
    ) return expressionCapability(expression.right);
    return undefined;
  };
  const combineCapabilities = (left, right) => {
    if (left === "process" || right === "process") return "process";
    if (left === "environment" || right === "environment") return "environment";
    if (left === "globalThis" || right === "globalThis") return "globalThis";
    if (left === "unknown" || right === "unknown") return "unknown";
    return left || right;
  };
  const containedCapability = (capability) => capability ? `contained:${capability}` : undefined;
  const projectedMemberCapability = (capability) => capability?.startsWith("contained:")
    ? capability.slice("contained:".length)
    : undefined;
  const bindPattern = (name, capability, changed) => {
    if (ts.isIdentifier(name)) {
      return capability ? setCapability(name, capability) || changed : changed;
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      let elementCapability;
      if (element.dotDotDotToken) {
        elementCapability = capability;
      } else if (ts.isObjectBindingPattern(name)) {
        const property = element.propertyName
          ? (ts.isComputedPropertyName(element.propertyName)
            ? staticString(element.propertyName.expression)
            : element.propertyName.text)
          : ts.isIdentifier(element.name) ? element.name.text : undefined;
        elementCapability = propertyCapability(capability, property);
      } else elementCapability = capability;
      const defaultCapability = element.initializer
        ? expressionCapability(element.initializer)
        : undefined;
      changed = bindPattern(
        element.name,
        combineCapabilities(defaultCapability, elementCapability),
        changed,
      );
    }
    return changed;
  };
  const propertyCapability = (capability, property) => {
    if (capability === "globalThis") {
      if (property === "process") return "process";
      if (property === "globalThis") return "globalThis";
      return undefined;
    }
    return capability === "process" || capability === "environment"
      ? capability
      : undefined;
  };
  const assignmentPropertyName = (property) => {
    if (ts.isComputedPropertyName(property)) return staticString(property.expression);
    return property.text;
  };
  const isStraightLineAssignment = (node) => {
    let statement = node;
    while (statement.parent && !ts.isExpressionStatement(statement)) {
      if (
        ts.isIfStatement(statement)
        || ts.isConditionalExpression(statement)
        || ts.isBinaryExpression(statement) && (
          statement.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          || statement.operatorToken.kind === ts.SyntaxKind.BarBarToken
          || statement.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        )
      ) return false;
      statement = statement.parent;
    }
    if (!ts.isExpressionStatement(statement)) return false;
    for (let ancestor = statement.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
      if (
        ts.isIfStatement(ancestor)
        || ts.isIterationStatement(ancestor, false)
        || ts.isSwitchStatement(ancestor)
        || ts.isCaseBlock(ancestor)
        || ts.isTryStatement(ancestor)
        || ts.isCatchClause(ancestor)
        || ts.isConditionalExpression(ancestor)
      ) return false;
      if (ts.isFunctionLike(ancestor)) break;
    }
    return true;
  };
  const assignmentBindsSymbol = (target, symbol) => {
    const assignmentTarget = unwrapExpression(target);
    if (ts.isIdentifier(assignmentTarget)) return symbolFor(assignmentTarget) === symbol;
    if (
      ts.isBinaryExpression(assignmentTarget)
      && assignmentTarget.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      return assignmentBindsSymbol(assignmentTarget.left, symbol);
    }
    if (ts.isObjectLiteralExpression(assignmentTarget)) {
      return assignmentTarget.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) return assignmentBindsSymbol(property.expression, symbol);
        if (ts.isShorthandPropertyAssignment(property)) return symbolFor(property.name) === symbol;
        return ts.isPropertyAssignment(property)
          && assignmentBindsSymbol(property.initializer, symbol);
      });
    }
    if (ts.isArrayLiteralExpression(assignmentTarget)) {
      return assignmentTarget.elements.some((element) => !ts.isOmittedExpression(element)
        && assignmentBindsSymbol(ts.isSpreadElement(element) ? element.expression : element, symbol));
    }
    return false;
  };
  const assignmentResult = (node) => {
    let expression = unwrapExpression(node);
    while (
      ts.isBinaryExpression(expression)
      && (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        || expression.operatorToken.kind === ts.SyntaxKind.CommaToken)
    ) expression = unwrapExpression(expression.right);
    return expression;
  };
  const propertyName = (name) => ts.isComputedPropertyName(name)
    ? staticString(name.expression)
    : name.text;
  const objectPropertyValue = (object, key) => {
    if (key === undefined || object.properties.some(ts.isSpreadAssignment)) {
      return {
        exact: false,
        values: object.properties.flatMap((property) => {
          if (ts.isSpreadAssignment(property)) return [property.expression];
          if (ts.isShorthandPropertyAssignment(property)) return [property.name];
          return ts.isPropertyAssignment(property) ? [property.initializer] : [];
        }),
      };
    }
    const matches = object.properties.filter((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return property.name.text === key;
      return ts.isPropertyAssignment(property) && propertyName(property.name) === key;
    });
    if (matches.length !== 1) return { exact: matches.length === 0, values: [] };
    const match = matches[0];
    return {
      exact: true,
      values: [ts.isShorthandPropertyAssignment(match) ? match.name : match.initializer],
    };
  };
  const isDefinitelyUndefined = (node) => {
    const expression = assignmentResult(node);
    if (ts.isVoidExpression(expression)) return true;
    if (!ts.isIdentifier(expression) || expression.text !== "undefined") return false;
    return !isLocallyBound(symbolFor(expression), expression);
  };
  const arrayLiteralElements = (array, seen = new Set()) => {
    if (seen.has(array)) return { exact: false, values: [] };
    const nextSeen = new Set(seen).add(array);
    let exact = true;
    const values = [];
    for (const element of array.elements) {
      if (ts.isOmittedExpression(element)) {
        values.push(element);
      } else if (ts.isSpreadElement(element)) {
        const spread = assignmentResult(element.expression);
        if (ts.isArrayLiteralExpression(spread)) {
          const nested = arrayLiteralElements(spread, nextSeen);
          exact = exact && nested.exact;
          values.push(...nested.values);
        } else {
          exact = false;
          values.push(spread);
        }
      } else values.push(element);
    }
    return { exact, values };
  };
  const projectAssignmentWrite = (target, value, symbol) => {
    const assignmentTarget = unwrapExpression(target);
    const assignedValue = assignmentResult(value);
    if (ts.isIdentifier(assignmentTarget)) {
      return symbolFor(assignmentTarget) === symbol
        ? { exact: true, values: [assignedValue] }
        : { exact: true, values: [] };
    }
    if (
      ts.isBinaryExpression(assignmentTarget)
      && assignmentTarget.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const projected = projectAssignmentWrite(assignmentTarget.left, assignedValue, symbol);
      if (!assignmentBindsSymbol(assignmentTarget.left, symbol)) return projected;
      if (!projected.exact) return { exact: false, values: [...projected.values, assignmentTarget.right] };
      if (projected.values.length === 0 || projected.values.every(isDefinitelyUndefined)) {
        return { exact: true, values: [assignmentTarget.right] };
      }
      return projected.values.some(isDefinitelyUndefined)
        ? { exact: false, values: [...projected.values, assignmentTarget.right] }
        : projected;
    }
    if (ts.isObjectLiteralExpression(assignmentTarget)) {
      if (!ts.isObjectLiteralExpression(assignedValue)) return { exact: false, values: [] };
      for (const property of assignmentTarget.properties) {
        if (ts.isSpreadAssignment(property)) {
          if (assignmentBindsSymbol(property.expression, symbol)) {
            return objectPropertyValue(assignedValue, undefined);
          }
          continue;
        }
        const nestedTarget = ts.isShorthandPropertyAssignment(property)
          ? property.name
          : property.initializer;
        if (!assignmentBindsSymbol(nestedTarget, symbol)) continue;
        const key = ts.isShorthandPropertyAssignment(property)
          ? property.name.text
          : propertyName(property.name);
        const projectedProperty = objectPropertyValue(assignedValue, key);
        if (!projectedProperty.exact) return projectedProperty;
        if (projectedProperty.values.length === 0) {
          return projectAssignmentWrite(nestedTarget, ts.factory.createIdentifier("undefined"), symbol);
        }
        return projectAssignmentWrite(nestedTarget, projectedProperty.values[0], symbol);
      }
      return { exact: true, values: [] };
    }
    if (ts.isArrayLiteralExpression(assignmentTarget)) {
      if (!ts.isArrayLiteralExpression(assignedValue)) {
        return { exact: false, values: [] };
      }
      const projectedArray = arrayLiteralElements(assignedValue);
      for (let index = 0; index < assignmentTarget.elements.length; index += 1) {
        const nestedTarget = assignmentTarget.elements[index];
        const nestedAssignmentTarget = ts.isSpreadElement(nestedTarget)
          ? nestedTarget.expression
          : nestedTarget;
        if (ts.isOmittedExpression(nestedTarget)
          || !assignmentBindsSymbol(nestedAssignmentTarget, symbol)) continue;
        if (ts.isSpreadElement(nestedTarget)) {
          return {
            exact: projectedArray.exact,
            values: projectedArray.values.slice(index).filter((element) => !ts.isOmittedExpression(element)),
            containerDepth: 1,
          };
        }
        if (!projectedArray.exact) return { exact: false, values: projectedArray.values };
        const projectedElement = projectedArray.values[index];
        if (!projectedElement || ts.isOmittedExpression(projectedElement)) {
          return projectAssignmentWrite(nestedTarget, ts.factory.createIdentifier("undefined"), symbol);
        }
        return projectAssignmentWrite(nestedTarget, projectedElement, symbol);
      }
      return { exact: true, values: [] };
    }
    return { exact: false, values: [] };
  };
  const isAssignmentOperator = (kind) => kind >= ts.SyntaxKind.FirstAssignment
    && kind <= ts.SyntaxKind.LastAssignment;
  const reachingWrites = (symbol, position, boundary) => {
    const writes = [];
    const collect = (node) => {
      if (
        ts.isBinaryExpression(node)
        && isAssignmentOperator(node.operatorToken.kind)
        && assignmentBindsSymbol(node.left, symbol)
      ) {
        const writeBoundary = executionBoundary(node);
        if (node.getStart(sourceFile) < position || writeBoundary !== boundary) {
          const projection = node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ? projectAssignmentWrite(node.left, node.right, symbol)
            : { exact: false, values: [] };
          writes.push({
            position: node.getStart(sourceFile),
            values: projection.values,
            definite: node.operatorToken.kind === ts.SyntaxKind.EqualsToken
              && isStraightLineAssignment(node)
              && projection.exact,
            boundary: writeBoundary,
          });
        }
      } else if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && assignmentBindsSymbol(node.operand, symbol)
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      ) {
        const writeBoundary = executionBoundary(node);
        if (node.getStart(sourceFile) < position || writeBoundary !== boundary) {
          writes.push({
            position: node.getStart(sourceFile),
            values: [],
            definite: false,
            boundary: writeBoundary,
          });
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    return writes.sort((left, right) => left.position - right.position);
  };
  const isStaticallySafeValue = (node, seen = new Set()) => {
    const expression = unwrapExpression(node);
    if (
      ts.isObjectLiteralExpression(expression)
      || ts.isArrayLiteralExpression(expression)
      || ts.isStringLiteralLike(expression)
      || ts.isNumericLiteral(expression)
      || ts.isRegularExpressionLiteral(expression)
      || ts.isBigIntLiteral(expression)
      || expression.kind === ts.SyntaxKind.TrueKeyword
      || expression.kind === ts.SyntaxKind.FalseKeyword
      || expression.kind === ts.SyntaxKind.NullKeyword
      || ts.isArrowFunction(expression)
      || ts.isFunctionExpression(expression)
      || ts.isClassExpression(expression)
    ) return true;
    if (ts.isVoidExpression(expression)) return true;
    if (ts.isIdentifier(expression)) {
      const symbol = symbolFor(expression);
      if (expression.text === "undefined" && !isLocallyBound(symbol, expression)) return true;
      if (!symbol || !isLocallyBound(symbol) || seen.has(symbol)) return false;
      if (capabilityAt(symbol, expression.getStart(sourceFile))) return false;
      const declaration = symbol.declarations?.find(
        (candidate) => ts.isVariableDeclaration(candidate)
          && candidate.initializer
          && candidate.getStart(sourceFile) < expression.getStart(sourceFile),
      );
      if (!declaration || executionBoundary(declaration) !== executionBoundary(expression)) return false;
      const nextSeen = new Set(seen).add(symbol);
      let safe = isStaticallySafeValue(declaration.initializer, nextSeen);
      for (const write of reachingWrites(
        symbol,
        expression.getStart(sourceFile),
        executionBoundary(expression),
      )) {
        if (write.position <= declaration.getStart(sourceFile)) continue;
        if (!write.definite || write.boundary !== executionBoundary(expression)) return false;
        safe = write.values.every((value) => isStaticallySafeValue(value, nextSeen));
      }
      return safe;
    }
    return false;
  };
  const executionBoundary = (node) => {
    for (let current = node; current; current = current.parent) {
      if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
    }
    return undefined;
  };
  const bindingSharesExecutionBoundary = (identifier) => {
    const symbol = symbolFor(identifier);
    const assignmentBoundary = executionBoundary(identifier);
    return Boolean(symbol?.declarations?.some(
      (declaration) => executionBoundary(declaration) === assignmentBoundary,
    ));
  };
  const bindAssignmentTarget = (target, capability, changed) => {
    const assignmentTarget = unwrapExpression(target);
    if (ts.isIdentifier(assignmentTarget)) {
      return capability ? setCapability(assignmentTarget, capability) || changed : changed;
    }
    if (
      ts.isBinaryExpression(assignmentTarget)
      && assignmentTarget.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      return bindAssignmentTarget(
        assignmentTarget.left,
        combineCapabilities(capability, expressionCapability(assignmentTarget.right)),
        changed,
      );
    }
    if (ts.isObjectLiteralExpression(assignmentTarget)) {
      for (const property of assignmentTarget.properties) {
        if (ts.isSpreadAssignment(property)) {
          changed = bindAssignmentTarget(property.expression, capability, changed);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          changed = bindAssignmentTarget(
            property.name,
            propertyCapability(capability, property.name.text),
            changed,
          );
        } else if (ts.isPropertyAssignment(property)) {
          changed = bindAssignmentTarget(
            property.initializer,
            propertyCapability(capability, assignmentPropertyName(property.name)),
            changed,
          );
        }
      }
      return changed;
    }
    if (ts.isArrayLiteralExpression(assignmentTarget)) {
      for (const element of assignmentTarget.elements) {
        if (ts.isOmittedExpression(element)) continue;
        changed = bindAssignmentTarget(
          ts.isSpreadElement(element) ? element.expression : element,
          capability,
          changed,
        );
      }
    }
    return changed;
  };
  const assignedIdentifiers = (target, identifiers = []) => {
    const assignmentTarget = unwrapExpression(target);
    if (ts.isIdentifier(assignmentTarget)) identifiers.push(assignmentTarget);
    else if (
      ts.isBinaryExpression(assignmentTarget)
      && assignmentTarget.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) assignedIdentifiers(assignmentTarget.left, identifiers);
    else if (ts.isObjectLiteralExpression(assignmentTarget)) {
      for (const property of assignmentTarget.properties) {
        if (ts.isSpreadAssignment(property)) assignedIdentifiers(property.expression, identifiers);
        else if (ts.isShorthandPropertyAssignment(property)) identifiers.push(property.name);
        else if (ts.isPropertyAssignment(property)) assignedIdentifiers(property.initializer, identifiers);
      }
    } else if (ts.isArrayLiteralExpression(assignmentTarget)) {
      for (const element of assignmentTarget.elements) {
        if (!ts.isOmittedExpression(element)) {
          assignedIdentifiers(ts.isSpreadElement(element) ? element.expression : element, identifiers);
        }
      }
    }
    return identifiers;
  };
  const propagateProjectedAssignment = (target, value, node, state) => {
    const identifiers = assignedIdentifiers(target);
    for (const identifier of identifiers) {
      const symbol = symbolFor(identifier);
      if (!symbol) continue;
      const projection = projectAssignmentWrite(target, value, symbol);
      let capability = projection.values.reduce(
        (combined, projectedValue) => combineCapabilities(combined, expressionCapability(projectedValue)),
        undefined,
      );
      for (let depth = 0; depth < (projection.containerDepth || 0); depth += 1) {
        capability = containedCapability(capability);
      }
      if (!projection.exact && !capability) capability = "unknown";
      if (capability) {
        state.changed = setCapability(identifier, capability, node.getEnd()) || state.changed;
      } else if (
        projection.exact
        && projection.values.length > 0
        && isStraightLineAssignment(node)
        && bindingSharesExecutionBoundary(identifier)
        && projection.values.every((projectedValue) => isStaticallySafeValue(projectedValue))
      ) {
        state.changed = setCapability(identifier, undefined, node.getEnd()) || state.changed;
      }
    }
    if (!identifiers.length || identifiers.every((identifier) => {
      const projection = projectAssignmentWrite(target, value, symbolFor(identifier));
      return !projection.exact;
    })) {
      state.changed = bindAssignmentTarget(target, expressionCapability(value), state.changed);
    }
  };
  const propagateBindings = (node, state) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      state.changed = bindPattern(node.name, expressionCapability(node.initializer), state.changed);
    } else if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        propagateProjectedAssignment(node.left, node.right, node, state);
      } else {
        const target = unwrapExpression(node.left);
        if (ts.isIdentifier(target)) {
          const capability = combineCapabilities(
            expressionCapability(target),
            expressionCapability(node.right),
          );
          if (capability) {
            state.changed = setCapability(target, capability, node.getEnd()) || state.changed;
          }
        }
      }
    }
    ts.forEachChild(node, (child) => propagateBindings(child, state));
  };
  for (let pass = 0; pass <= sourceFile.getChildCount(); pass += 1) {
    const state = { changed: false };
    propagateBindings(sourceFile, state);
    if (!state.changed) break;
  }
  const findings = [];
  const inspect = (node) => {
    if (!insideAllowedRead(node)) {
      if (isImportMeta(node)) {
        findings.push(`import.meta at ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
      } else if (
        ts.isIdentifier(node)
        && !isNonReferenceIdentifier(node)
        && ["process", "unknown"].includes(expressionCapability(node))
      ) {
        findings.push(`global process at ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
      } else if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        && ["process", "environment"].includes(expressionCapability(node))
      ) {
        findings.push(`environment capability at ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);
  return [...new Set(findings)];
}

export function scanFrontendSource(file, source, parserMode) {
  const { repositoryPath, authorizedPath } = canonicalRepositoryPath(file);
  if (authorizedPath && AUTHORIZED_ENVIRONMENT_READERS.has(repositoryPath)) return [];
  const purposeLimitedRead = authorizedPath ? PURPOSE_LIMITED_ENVIRONMENT_READERS[repositoryPath] : undefined;
  const findings = findEnvironmentSelectionBypasses(source, repositoryPath, purposeLimitedRead, parserMode);
  return findings.length ? [{ file: repositoryPath, findings }] : [];
}

function sourceFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const file = path.join(directory, name);
      return statSync(file).isDirectory() ? sourceFiles(file) : [file];
    })
    .filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(file));
}

test("executable frontend code has no deployment-selection bypass", () => {
  const candidates = [...sourceFiles(srcRoot.pathname), new URL("../vite.config.ts", import.meta.url).pathname];
  const offenders = candidates.flatMap((file) => scanFrontendSource(file, readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("scanner rejects computed keys and syntax evasions in every executable extension", () => {
  const fixtures = [
    ['import.meta.env[["VITE", "API", "ORIGIN"].join("_")]', ".ts"],
    ['process.env["VITE_" + "SOCKET_URL"]', ".tsx"],
    ['import.meta.env[`VITE_${"DEPLOY_ENV"}`]', ".js"],
    ["import.meta.env.VITE_API_ORIGIN", ".mjs"],
    ['import.meta.env["VITE_API_ORIGIN"]', ".ts"],
    ["const { VITE_API_ORIGIN } = import.meta.env", ".tsx"],
    ["(import.meta.env).VITE_API_ORIGIN", ".js"],
    ["const environment = import.meta.env; environment.VITE_API_ORIGIN", ".mjs"],
    ["const environment = process.env; environment.VITE_API_ORIGIN", ".ts"],
    ["const first = import.meta.env; const second = first; second.VITE_SOCKET_URL", ".tsx"],
    ["const environment = (process.env); environment.VITE_API_BASE", ".js"],
    ["const\tenvironment = process[\n  \"env\"\n]; environment.VITE_API_ORIGIN", ".mjs"],
    ["export const secondReader = import.meta.env.VITE_DEPLOY_ENV", ".ts"],
  ];

  for (const [source, extension] of fixtures) {
    const file = new URL(`../src/services/unauthorized-reader${extension}`, import.meta.url).pathname;
    assert.equal(scanFrontendSource(file, source).length, 1, source);
  }
});

test("scanner detects all seven alias/computed reviewer probes across four extensions", () => {
  const reviewerProbes = [
    'const root = import.meta; root.env[["VITE", "API", "ORIGIN"].join("_")]',
    'const root = process; root.env["VITE_" + "SOCKET_URL"]',
    'const root = import.meta; root[["e", "nv"].join("")][`VITE_${"DEPLOY_ENV"}`]',
    'const root = process; root["e" + "nv"].VITE_API_BASE',
    'const first = import.meta; const second = first; second.env.VITE_SOCKET_URL',
    'const { env } = (import.meta); env.VITE_API_ORIGIN',
    'const\t{ env: environment } = (process /* root */);\nenvironment.VITE_DEPLOY_ENV',
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let detected = 0;
  for (const extension of extensions) {
    for (const source of reviewerProbes) {
      const file = new URL(`../src/services/reviewer-probe.${extension}`, import.meta.url).pathname;
      if (scanFrontendSource(file, source).length === 1) detected += 1;
    }
  }
  assert.equal(reviewerProbes.length * extensions.length, 28);
  assert.equal(detected, 28);
});

test("scanner rejects globalThis process capabilities across four extensions", () => {
  const probes = [
    "globalThis.process.env.VITE_API_ORIGIN",
    'globalThis["process"]["env"].VITE_API_ORIGIN',
    "globalThis[`process`].env.VITE_SOCKET_URL",
    "const root = globalThis; const second = root; second.process.env.VITE_DEPLOY_ENV",
    "const { process: runtime } = globalThis; runtime.env.VITE_API_BASE",
    "const { env } = globalThis.process; env.VITE_API_ORIGIN",
    "globalThis?.process?.env?.VITE_API_ORIGIN",
    'globalThis[["pro", "cess"].join("")]["e" + "nv"][["VITE", "API", "ORIGIN"].join("_")]',
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let detected = 0;
  for (const extension of extensions) {
    for (const source of probes) {
      const file = new URL(`../src/services/global-this-probe.${extension}`, import.meta.url).pathname;
      if (scanFrontendSource(file, source).length === 1) detected += 1;
    }
  }
  const expected = probes.length * extensions.length;
  assert.equal(expected, 32);
  assert.equal(detected, expected);
});

test("scanner propagates self-global and destructuring-assignment capabilities across extensions", () => {
  const probes = [
    "globalThis.globalThis.process.env.VITE_API_ORIGIN",
    'globalThis["globalThis"]["process"]["env"].VITE_API_ORIGIN',
    "globalThis[`globalThis`].process.env.VITE_API_ORIGIN",
    "globalThis?.globalThis?.process?.env?.VITE_API_ORIGIN",
    "(globalThis.globalThis).process.env.VITE_API_ORIGIN",
    "const root = globalThis; root.globalThis.process.env.VITE_API_ORIGIN",
    "let runtime; ({ process: runtime } = globalThis); runtime.env.VITE_API_ORIGIN",
    'let runtime; ({ ["pro" + "cess"]: runtime } = globalThis); runtime.env.VITE_API_ORIGIN',
    "let runtime; ({ process: { env: runtime } } = globalThis); runtime.VITE_API_ORIGIN",
    "let runtime; ({ env: runtime } = globalThis.process); runtime.VITE_API_ORIGIN",
    "let runtime; ({ env: runtime } = import.meta); runtime.VITE_API_ORIGIN",
    "let runtime; ({ env: runtime } = process); runtime.VITE_API_ORIGIN",
    "let runtime; ({ process: runtime = fallback } = globalThis); const alias = runtime; alias.env.VITE_API_ORIGIN",
    "let runtime; [runtime] = process; const alias = runtime; alias.env.VITE_API_ORIGIN",
    "let runtime; ({ ...runtime } = globalThis); runtime.process.env.VITE_API_ORIGIN",
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let detected = 0;
  for (const extension of extensions) {
    for (const source of probes) {
      const file = new URL(`../src/services/assignment-probe.${extension}`, import.meta.url).pathname;
      if (scanFrontendSource(file, source).length === 1) detected += 1;
    }
  }
  assert.equal(detected, probes.length * extensions.length);
});

test("scanner propagates declaration-destructuring capabilities across extensions", () => {
  const probes = [
    "const { globalThis: root } = globalThis; root.process.env.VITE_API_ORIGIN",
    "const { [`globalThis`]: root } = globalThis; root.process.env.VITE_API_ORIGIN",
    "const { globalThis: { process: { env } } } = globalThis; env.VITE_API_ORIGIN",
    "const { ...root } = globalThis; root.process.env.VITE_API_ORIGIN",
    "const { globalThis: renamed = fallback } = globalThis; const alias = renamed; alias.process.env.VITE_API_ORIGIN",
    "const { globalThis: { process: runtime } } = (globalThis); runtime.env.VITE_API_ORIGIN",
    "const { globalThis: root } = globalThis?.globalThis; root.process.env.VITE_API_ORIGIN",
    "const { env } = globalThis.process; env.VITE_API_ORIGIN",
    "const { env: runtime } = process; runtime.VITE_API_ORIGIN",
    "const { env: runtime } = import.meta; runtime.VITE_API_ORIGIN",
    "const { VITE_API_ORIGIN: value } = import.meta.env; value",
    "const source = globalThis; const { globalThis: root } = source; const alias = root; alias.process.env.VITE_API_ORIGIN",
    "const [runtime] = process; runtime.env.VITE_API_ORIGIN",
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let detected = 0;
  for (const extension of extensions) {
    for (const source of probes) {
      const file = new URL(`../src/services/declaration-probe.${extension}`, import.meta.url).pathname;
      if (scanFrontendSource(file, source).length === 1) detected += 1;
    }
  }
  assert.equal(detected, probes.length * extensions.length);
});

test("scanner propagates declaration capabilities through TypeScript source wrappers", () => {
  const probes = [
    "const { globalThis: root } = (globalThis as typeof globalThis); root.process.env.VITE_API_ORIGIN",
    "const { globalThis: root } = (globalThis satisfies typeof globalThis); root.process.env.VITE_API_ORIGIN",
    "const { globalThis: root } = globalThis!; root.process.env.VITE_API_ORIGIN",
    "const { globalThis: root } = (<typeof globalThis>globalThis); root.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx"]) {
    for (const source of probes.slice(0, extension === "tsx" ? 3 : 4)) {
      const file = new URL(`../src/services/declaration-wrapper.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
});

test("scanner propagates binding-element default capabilities in scripts and modules", () => {
  const probes = [
    "const { runtime = globalThis } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const [runtime = globalThis] = []; runtime.process.env.VITE_API_ORIGIN",
    "const { missing: runtime = globalThis } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { [`missing`]: runtime = globalThis } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { missing: { runtime = globalThis } = {} } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const fallback = globalThis; const { runtime = fallback } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const first = globalThis; const second = first; const { runtime = second } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { runtime = (globalThis?.globalThis) } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { runtime = globalThis.process } = {}; runtime.env.VITE_API_ORIGIN",
    "const { runtime = process } = {}; runtime.env.VITE_API_ORIGIN",
    "const { runtime = import.meta } = {}; runtime.env.VITE_API_ORIGIN",
    "const { runtime = import.meta.env } = {}; runtime.VITE_API_ORIGIN",
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let detected = 0;
  for (const extension of extensions) {
    for (const source of probes) {
      for (const modulePrefix of ["", "export {};\n"]) {
        const file = new URL(`../src/services/default-binding.${extension}`, import.meta.url).pathname;
        if (scanFrontendSource(file, modulePrefix + source).length === 1) detected += 1;
      }
    }
  }
  assert.equal(detected, probes.length * extensions.length * 2);
});

test("scanner propagates TypeScript-wrapped binding-element defaults", () => {
  const probes = [
    "const { runtime = (globalThis as typeof globalThis) } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { runtime = (globalThis satisfies typeof globalThis) } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { runtime = globalThis! } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const { runtime = (<typeof globalThis>globalThis) } = {}; runtime.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx"]) {
    for (const source of probes.slice(0, extension === "tsx" ? 3 : 4)) {
      const file = new URL(`../src/services/default-wrapper.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
});

test("purpose-limited files reject self-global and assignment-destructuring bypasses", () => {
  const loginFile = new URL("../src/pages/LoginPage.tsx", import.meta.url).pathname;
  const stripeFile = new URL("../src/lib/stripe.ts", import.meta.url).pathname;
  const probes = [
    "globalThis.globalThis.process.env.VITE_API_ORIGIN",
    "let runtime; ({ process: runtime } = globalThis); runtime.env.VITE_API_ORIGIN",
    'let runtime; ({ ["pro" + "cess"]: runtime } = globalThis); runtime.env.VITE_API_ORIGIN',
  ];
  for (const file of [loginFile, stripeFile]) {
    for (const source of probes) assert.equal(scanFrontendSource(file, source).length, 1, source);
  }
});

test("purpose-limited files reject declaration-destructuring bypasses", () => {
  const loginFile = new URL("../src/pages/LoginPage.tsx", import.meta.url).pathname;
  const stripeFile = new URL("../src/lib/stripe.ts", import.meta.url).pathname;
  const probes = [
    "const { globalThis: root } = globalThis; root.process.env.VITE_API_ORIGIN",
    "const { [`globalThis`]: root } = globalThis; root.process.env.VITE_API_ORIGIN",
    "const { globalThis: { process: { env } } } = globalThis; env.VITE_API_ORIGIN",
    "const { ...root } = globalThis; root.process.env.VITE_API_ORIGIN",
  ];
  for (const file of [loginFile, stripeFile]) {
    for (const source of probes) assert.equal(scanFrontendSource(file, source).length, 1, source);
  }
});

test("purpose-limited files reject binding-element default bypasses", () => {
  const files = [
    new URL("../src/pages/LoginPage.tsx", import.meta.url).pathname,
    new URL("../src/lib/stripe.ts", import.meta.url).pathname,
  ];
  const probes = [
    "const { runtime = globalThis } = {}; runtime.process.env.VITE_API_ORIGIN",
    "const [runtime = globalThis] = []; runtime.process.env.VITE_API_ORIGIN",
    "const { missing: runtime = globalThis.process } = {}; runtime.env.VITE_API_ORIGIN",
    "const { [`missing`]: runtime = process } = {}; runtime.env.VITE_API_ORIGIN",
  ];
  let detected = 0;
  for (const file of files) {
    for (const source of probes) {
      if (scanFrontendSource(file, source).length === 1) detected += 1;
    }
  }
  assert.equal(detected, files.length * probes.length);
});

test("scanner rejects TypeScript wrappers around global process capabilities", () => {
  const probes = [
    "(globalThis.process as NodeJS.Process).env.VITE_API_ORIGIN",
    "(globalThis.process satisfies NodeJS.Process).env.VITE_SOCKET_URL",
    "globalThis.process!.env.VITE_DEPLOY_ENV",
    "(globalThis.globalThis as typeof globalThis).process.env.VITE_API_ORIGIN",
    "let runtime; ({ process: runtime } = (globalThis as typeof globalThis)); runtime.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx"]) {
    for (const source of probes) {
      const file = new URL(`../src/services/typescript-wrapper.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
  const typeAssertion = "(<NodeJS.Process>globalThis.process).env.VITE_API_BASE";
  const typeAssertionFile = new URL("../src/services/type-assertion.ts", import.meta.url).pathname;
  assert.equal(scanFrontendSource(typeAssertionFile, typeAssertion).length, 1, typeAssertion);
});

test("scanner distinguishes locally bound process and globalThis identifiers", () => {
  const fixtures = [
    ['const process = { title: "local" }; process.title', ".ts"],
    ['let process = { title: "local" }; process.title', ".tsx"],
    ['var process = { title: "local" }; process.title', ".js"],
    ['function f(process) { return process.title }', ".mjs"],
    ['const f = (process) => process.title', ".ts"],
    ['import process from "./local-process"; process.title', ".tsx"],
    ['const local = { process: { title: "local" } }; const { process } = local; process.title', ".js"],
    ['function process() {} process.title', ".mjs"],
    ['class process {} process.title', ".ts"],
    ['try { throw 1 } catch (process) { process.title }', ".tsx"],
    ['process.title; const process = { title: "local" }', ".js"],
    ['const globalThis = { process: { env: {} } }; globalThis.process.env.VITE_API_ORIGIN', ".mjs"],
    ['function f(globalThis) { return globalThis.process.env.VITE_API_ORIGIN }', ".ts"],
  ];
  for (const [source, extension] of fixtures) {
    const file = new URL(`../src/services/local-binding${extension}`, import.meta.url).pathname;
    assert.deepEqual(scanFrontendSource(file, source), [], source);
  }
});

test("scanner permits local globalThis bindings consistently in scripts and modules", () => {
  const fixtures = [
    'const globalThis = { process: { env: { VITE_API_ORIGIN: "local" } } }; globalThis.process.env.VITE_API_ORIGIN',
    'let globalThis = { process: { env: {} } }; globalThis.process.env.VITE_API_ORIGIN',
    'var globalThis = { process: { env: {} } }; globalThis.process.env.VITE_API_ORIGIN',
    "function f(globalThis) { return globalThis.process.env.VITE_API_ORIGIN }",
    "const f = (globalThis) => globalThis.process.env.VITE_API_ORIGIN",
    'import globalThis from "./local-global-this"; globalThis.process.env.VITE_API_ORIGIN',
    'const local = { globalThis: { process: { env: {} } } }; const { globalThis } = local; globalThis.process.env.VITE_API_ORIGIN',
    'try { throw {} } catch (globalThis) { globalThis.process.env.VITE_API_ORIGIN }',
    "function globalThis() {} globalThis.process",
    "class globalThis {} globalThis.process",
    "function outer() { const globalThis = { process: { env: {} } }; return globalThis.process.env.VITE_API_ORIGIN }",
    'const object = { globalThis: { process: { env: {} } } }; object.globalThis.process.env.VITE_API_ORIGIN',
    'const globalThis = { process: { env: {} } }; const { runtime = globalThis } = {}; runtime.process.env.VITE_API_ORIGIN',
    'const process = { env: {} }; const [runtime = process] = []; runtime.env.VITE_API_ORIGIN',
    'const text = "globalThis.globalThis.process.env.VITE_API_ORIGIN"; // globalThis.process.env.VITE_API_ORIGIN',
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let permitted = 0;
  for (const extension of extensions) {
    for (const source of fixtures) {
      for (const modulePrefix of ["", "export {};\n"]) {
        const file = new URL(`../src/services/local-global-this.${extension}`, import.meta.url).pathname;
        if (scanFrontendSource(file, modulePrefix + source).length === 0) permitted += 1;
      }
    }
  }
  assert.equal(permitted, fixtures.length * extensions.length * 2);
});

test("scanner invalidates capabilities after definite safe reassignment", () => {
  const safeLocal = "const safe = { process: { env: { VITE_API_ORIGIN: 'local' } } }; ";
  const fixtures = [
    "let root = globalThis; root = { process: { env: { VITE_API_ORIGIN: 'local' } } }; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root = 42; root.VITE_API_ORIGIN",
    "let root = globalThis; root = 'local'; root.VITE_API_ORIGIN",
    "let root = globalThis; root = []; root.VITE_API_ORIGIN",
    "let root = globalThis; root = () => 'local'; root.VITE_API_ORIGIN",
    `${safeLocal}let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN`,
    "let safe = {}; safe = []; safe = {}; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; { let root = { process: { env: {} } }; root.process.env.VITE_API_ORIGIN } root = {}; root.process",
  ];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let permitted = 0;
  for (const extension of extensions) {
    for (const source of fixtures) {
      for (const modulePrefix of ["", "export {};\n"]) {
        const file = new URL(`../src/services/overwrite.${extension}`, import.meta.url).pathname;
        if (scanFrontendSource(file, modulePrefix + source).length === 0) permitted += 1;
      }
    }
  }
  assert.equal(permitted, fixtures.length * extensions.length * 2);
});

test("mutated safe aliases cannot clear a genuine capability", () => {
  const probes = [
    "let safe = {}; safe = unknownValue; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe = flag ? globalThis : {}; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; if (flag) safe = {}; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; flag && (safe = {}); let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; while (flag) safe = {}; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; function mutate() { safe = {}; } let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; mutate(); let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN; function mutate() { safe = unknownValue; }",
    "let safe = {}; callback(() => { safe = {}; }); let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe ||= {}; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe = globalThis; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe = []; safe = unknownValue; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe = unknownValue; safe = globalThis; let root = {}; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; try { safe = {}; } catch { safe = {}; } let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; switch (value) { case 1: safe = {}; } let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const source of probes) {
      const file = new URL(`../src/services/mutated-alias.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
});

test("assignment destructuring projects only the corresponding RHS value", () => {
  const unsafe = [
    "let root; ({ safe: root } = { safe: globalThis }); root.process.env.VITE_API_ORIGIN",
    "let root; ({ ['sa' + 'fe']: root } = { safe: globalThis }); root.process.env.VITE_API_ORIGIN",
    "let root; ([, root] = [0, globalThis.process]); root.env.VITE_API_ORIGIN",
    "let root; ({ outer: [,{ process: root }] } = { outer: [0, { process: globalThis.process }] }); root.env.VITE_API_ORIGIN",
    "let root; ({ missing: root = globalThis } = {}); root.process.env.VITE_API_ORIGIN",
    "let root; ({ process: root = globalThis.process } = { process: undefined }); root.env.VITE_API_ORIGIN",
    "let root; ({ process: root } = ((globalThis as typeof globalThis))); root.env.VITE_API_ORIGIN",
    "let root; ({ env: root } = (globalThis.process satisfies NodeJS.Process)); root.VITE_API_ORIGIN",
    "let root; ({ env: root } = (0, globalThis.process)); root.VITE_API_ORIGIN",
    "let root; ({ process: root } = (holder = globalThis)); root.env.VITE_API_ORIGIN",
    "let root; ({ process: root } = globalThis.globalThis); root.env.VITE_API_ORIGIN",
    "let root; ({ env: root } = process); root.VITE_API_ORIGIN",
    "let root; ({ env: root } = import.meta); root.VITE_API_ORIGIN",
    "let root; ({ VITE_API_ORIGIN: root } = import.meta.env); root.value",
    "let root; ({ ...root } = { process: globalThis.process }); root.process.env.VITE_API_ORIGIN",
    "let root; ([...root] = [globalThis.process]); root[0].env.VITE_API_ORIGIN",
    "let root; ({ [dynamicKey]: root } = { process: globalThis.process }); root.env.VITE_API_ORIGIN",
  ];
  const safe = [
    "let root = globalThis; ({ safe: root } = { safe: {} }); root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; ([root] = [{}]); root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; ({ outer: { root } } = { outer: { root: {} } }); root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; ({ root = globalThis } = { root: {} }); root.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx"]) {
    const file = new URL(`../src/services/assignment-projection.${extension}`, import.meta.url).pathname;
    for (const source of unsafe) assert.equal(scanFrontendSource(file, source).length, 1, source);
    for (const source of safe) assert.deepEqual(scanFrontendSource(file, source), [], source);
  }
});

test("member mutation is not a rebinding but direct writes remain conservative", () => {
  const memberWrites = [
    "let safe = {}; safe.x = globalThis; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe[key] = globalThis; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe.deep = {}; safe.deep.x = globalThis; let root = globalThis; root = safe; root.process.env.VITE_API_ORIGIN",
  ];
  const directWrites = [
    "let root = globalThis; root = unknownValue; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; ({ root } = unknownValue); root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root += value; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root++; root.process.env.VITE_API_ORIGIN",
  ];
  const capabilityMembers = [
    "let root = {}; root = globalThis.process; root.env.VITE_API_ORIGIN",
    "let root = {}; root = import.meta.env; root.VITE_API_ORIGIN",
  ];
  const file = new URL("../src/services/write-classification.ts", import.meta.url).pathname;
  for (const source of memberWrites) assert.deepEqual(scanFrontendSource(file, source), [], source);
  for (const source of [...directWrites, ...capabilityMembers]) {
    assert.equal(scanFrontendSource(file, source).length, 1, source);
  }
});

test("scanner permits proven-safe terminal overwrites in scripts and modules", () => {
  const terminals = ["undefined", "void 0", "/safe/", "1n"];
  const extensions = ["ts", "tsx", "js", "mjs"];
  let permitted = 0;
  for (const extension of extensions) {
    for (const terminal of terminals) {
      for (const modulePrefix of ["", "export {};\n"]) {
        const source = `${modulePrefix}let root = globalThis; root = ${terminal}; root.process.env.VITE_API_ORIGIN`;
        const file = new URL(`../src/services/safe-terminal.${extension}`, import.meta.url).pathname;
        if (scanFrontendSource(file, source).length === 0) permitted += 1;
      }
    }
  }
  assert.equal(permitted, terminals.length * extensions.length * 2);
});

test("safe-terminal handling preserves unsafe operands and shadowed undefined", () => {
  const probes = [
    "let root = globalThis; root = void globalThis.process.env.VITE_API_ORIGIN; root.process",
    "const undefined = globalThis; let root = globalThis; root = undefined; root.process.env.VITE_API_ORIGIN",
    "const undefined = unknownValue; let root = globalThis; root = undefined; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root = {}; root = globalThis; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; function reset() { root = undefined; } root.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const source of probes) {
      const file = new URL(`../src/services/terminal-safety.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
});

test("uncertain reassignment cannot clear a genuine capability", () => {
  const probes = [
    "let root = globalThis; if (flag) root = {}; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; while (flag) root = {}; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; flag && (root = {}); root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; flag ? root = {} : value; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; function reset() { root = {}; } root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root = unknownValue; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root ||= {}; root.process.env.VITE_API_ORIGIN",
  ];
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const source of probes) {
      const file = new URL(`../src/services/uncertain.${extension}`, import.meta.url).pathname;
      assert.equal(scanFrontendSource(file, source).length, 1, `${extension}: ${source}`);
    }
  }
});

test("compound and logical assignments acquire capabilities across extensions and parser modes", () => {
  const probes = [
    ["||=", "let safe = {}; safe ||= globalThis; safe.process.env.VITE_API_ORIGIN"],
    ["&&=", "let safe = {}; safe &&= globalThis; safe.process.env.VITE_API_ORIGIN"],
    ["??=", "let safe = null; safe ??= globalThis; safe.process.env.VITE_API_ORIGIN"],
    ["+=", "let safe = {}; safe += globalThis; safe.process.env.VITE_API_ORIGIN"],
  ];
  const counts = new Map(probes.map(([operator]) => [operator, 0]));
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const [operator, source] of probes) {
      for (const [parserMode, modulePrefix] of [["script", ""], ["module", "export {};\n"]]) {
        const file = new URL(`../src/services/compound-acquisition.${extension}`, import.meta.url).pathname;
        const parsed = parseWithBindings(modulePrefix + source, file, parserMode).sourceFile;
        assert.equal(Boolean(parsed.externalModuleIndicator), Boolean(modulePrefix), `${extension} parser mode`);
        assert.equal(scanFrontendSource(file, modulePrefix + source, parserMode).length, 1, `${extension} ${operator}`);
        counts.set(operator, counts.get(operator) + 1);
      }
    }
  }
  assert.deepEqual(Object.fromEntries(counts), { "||=": 8, "&&=": 8, "??=": 8, "+=": 8 });
});

test("array rest and RHS spread preserve projected capabilities across extensions and parser modes", () => {
  const probes = [
    ["rest-leading", "let root; [...root] = [globalThis]; root[0].process.env.VITE_API_ORIGIN"],
    ["rest-trailing", "let root; [safe, ...root] = [{}, globalThis.process]; root[0].env.VITE_API_ORIGIN"],
    ["rest-nested", "let root; [[...root]] = [[globalThis]]; root[0].process.env.VITE_API_ORIGIN"],
    ["rest-object", "let root; ({ values: [...root] } = { values: [process] }); root[0].env.VITE_API_ORIGIN"],
    ["rest-alias", "let root; [...root] = [globalThis]; const alias = root; const transitive = alias; transitive[0].process.env.VITE_API_ORIGIN"],
    ["spread-leading", "let root; [root] = [...[globalThis]]; root.process.env.VITE_API_ORIGIN"],
    ["spread-middle", "let root; [, root] = [0, ...[globalThis.process], 2]; root.env.VITE_API_ORIGIN"],
    ["spread-trailing", "let root; [, root] = [0, ...[import.meta]]; root.env.VITE_API_ORIGIN"],
    ["spread-multiple", "let root; [, root] = [...[0], ...[import.meta.env]]; root.VITE_API_ORIGIN"],
    ["spread-unknown", "let root; [root] = [...unknownValues]; root.process.env.VITE_API_ORIGIN"],
    ["spread-wrapped", "let root; [root] = [...((([globalThis?.process])))]; root.env.VITE_API_ORIGIN"],
    ["spread-chain-comma", "let root; (holder = 0, [root] = [...[globalThis.globalThis]]); root.process.env.VITE_API_ORIGIN"],
  ];
  let detected = 0;
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    const parserFile = new URL(`../src/services/rest-spread.${extension}`, import.meta.url).pathname;
    assert.equal(Boolean(parseWithBindings("const value = 1", parserFile, "script").sourceFile.externalModuleIndicator), false);
    assert.equal(Boolean(parseWithBindings("export {};", parserFile, "module").sourceFile.externalModuleIndicator), true);
    for (const [category, source] of probes) {
      for (const [parserMode, modulePrefix] of [["script", ""], ["module", "export {};\n"]]) {
        const file = new URL(`../src/services/rest-spread.${extension}`, import.meta.url).pathname;
        assert.equal(scanFrontendSource(file, modulePrefix + source, parserMode).length, 1, `${extension} ${category}`);
        detected += 1;
      }
    }
  }
  assert.equal(detected, probes.length * 4 * 2);
});

test("new assignment regressions retain property-mutation and proven-safe negatives", () => {
  const propertyMutations = [
    "let safe = {}; safe.x = globalThis; safe.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe[key] = globalThis; safe.process.env.VITE_API_ORIGIN",
    "let safe = { deep: {} }; safe.deep.x = globalThis; safe.process.env.VITE_API_ORIGIN",
  ];
  const safeCases = [
    "let safe = {}; safe ||= {}; safe.process.env.VITE_API_ORIGIN",
    "let safe = {}; safe &&= {}; safe.process.env.VITE_API_ORIGIN",
    "let safe = null; safe ??= {}; safe.process.env.VITE_API_ORIGIN",
    "let safe = ''; safe += 'local'; safe.process.env.VITE_API_ORIGIN",
    "let root = globalThis; [root] = [{}]; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; [root] = [...[{}]]; root.process.env.VITE_API_ORIGIN",
    "let root = globalThis; root = undefined; root.process.env.VITE_API_ORIGIN",
  ];
  let propertyMutationNegatives = 0;
  let safeNegatives = 0;
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const [parserMode, modulePrefix] of [["script", ""], ["module", "export {};\n"]]) {
      const file = new URL(`../src/services/assignment-negatives.${extension}`, import.meta.url).pathname;
      for (const source of propertyMutations) {
        assert.deepEqual(scanFrontendSource(file, modulePrefix + source, parserMode), [], `${extension} property mutation`);
        propertyMutationNegatives += 1;
      }
      for (const source of safeCases) {
        assert.deepEqual(scanFrontendSource(file, modulePrefix + source, parserMode), [], `${extension} safe negative`);
        safeNegatives += 1;
      }
    }
  }
  assert.equal(propertyMutationNegatives, 24);
  assert.equal(safeNegatives, 56);
});

test("explicit script and module modes honor local global identifier bindings", () => {
  const shadowed = [
    "const globalThis = { process: { env: {} } }; globalThis.process.env.X",
    "const process = { env: {} }; process.env.X",
    "const undefined = { process: { env: {} } }; undefined.process.env.X",
  ];
  const genuine = [
    "globalThis.process.env.X",
    "process.env.X",
    "const root = globalThis; root.process.env.X",
  ];
  let shadowedTotal = 0;
  let genuineTotal = 0;
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const [parserMode, modulePrefix] of [["script", ""], ["module", "export {};\n"]]) {
      const file = new URL(`../src/services/shadowing.${extension}`, import.meta.url).pathname;
      for (const source of shadowed) {
        assert.deepEqual(scanFrontendSource(file, modulePrefix + source, parserMode), [], `${extension} ${parserMode}: ${source}`);
        shadowedTotal += 1;
      }
      for (const source of genuine) {
        assert.equal(scanFrontendSource(file, modulePrefix + source, parserMode).length, 1, `${extension} ${parserMode}: ${source}`);
        genuineTotal += 1;
      }
    }
  }
  assert.equal(shadowedTotal, 24);
  assert.equal(genuineTotal, 24);
});

test("import.meta projections report the later assigned-identifier read", () => {
  const probes = [
    ["meta-spread", "let root;\n[, root] = [0, ...[import.meta]];\nroot.env.VITE_API_ORIGIN;", 3],
    ["env-spread", "let root;\n[, root] = [0, ...[import.meta.env]];\nroot.VITE_API_ORIGIN;", 3],
    ["meta-rest", "let root;\n[...root] = [import.meta];\nroot[0].env.VITE_API_ORIGIN;", 3],
    ["env-rest", "let root;\n[...root] = [import.meta.env];\nroot[0].VITE_API_ORIGIN;", 3],
    ["meta-transitive", "let root;\n[, root] = [0, ...[import.meta]];\nconst alias = root; const transitive = alias;\ntransitive.env.VITE_API_ORIGIN;", 4],
    ["env-transitive", "let root;\n[...root] = [import.meta.env];\nconst alias = root; const transitive = alias;\ntransitive[0].VITE_API_ORIGIN;", 4],
  ];
  let laterReadTotal = 0;
  for (const extension of ["ts", "tsx", "js", "mjs"]) {
    for (const [parserMode, modulePrefix] of [["script", ""], ["module", "export {};\n"]]) {
      const lineOffset = modulePrefix ? 1 : 0;
      const file = new URL(`../src/services/import-meta-projection.${extension}`, import.meta.url).pathname;
      for (const [category, source, readLine] of probes) {
        const result = scanFrontendSource(file, modulePrefix + source, parserMode);
        assert.equal(result.length, 1, `${extension} ${parserMode} ${category}`);
        assert.ok(
          result[0].findings.includes(`environment capability at ${readLine + lineOffset}`),
          `${extension} ${parserMode} ${category}: ${result[0].findings.join(", ")}`,
        );
        laterReadTotal += 1;
      }
    }
  }
  assert.equal(laterReadTotal, 48);
});

test("scanner imports execute repeatedly without registering this suite or starting Vite", () => {
  const scannerUrl = new URL(import.meta.url);
  const repetitions = 12;
  const probe = `
    const scannerUrl = ${JSON.stringify(scannerUrl.href)};
    for (let index = 0; index < ${repetitions}; index += 1) {
      const { scanFrontendSource } = await import(scannerUrl + "?isolated=" + index);
      const findings = scanFrontendSource(
        "apps/web/src/services/isolation.ts",
        "const globalThis={process:{env:{}}}; globalThis.process.env.X",
        "script",
      );
      if (findings.length) process.exit(91);
    }
    console.log("scanner-imports:${repetitions}");
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: repositoryRoot.pathname,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), `scanner-imports:${repetitions}`);
});

test("authorized readers require canonical exact paths without traversal", () => {
  const deploymentRead = "const value = import.meta.env.VITE_API_ORIGIN";
  const configFile = new URL("../src/config.ts", import.meta.url).pathname;
  const viteConfigFile = new URL("../vite.config.ts", import.meta.url).pathname;
  assert.deepEqual(scanFrontendSource(configFile, deploymentRead), []);
  assert.deepEqual(scanFrontendSource(viteConfigFile, deploymentRead), []);
  assert.deepEqual(scanFrontendSource("apps/web/src/config.ts", deploymentRead), []);
  assert.deepEqual(scanFrontendSource("apps/web/vite.config.ts", deploymentRead), []);

  const configTraversal = `${repositoryRoot.pathname}apps/web/src/pages/../config.ts`;
  const viteTraversal = `${repositoryRoot.pathname}apps/web/src/../vite.config.ts`;
  assert.equal(scanFrontendSource(configTraversal, deploymentRead).length, 1);
  assert.equal(scanFrontendSource(viteTraversal, deploymentRead).length, 1);
  assert.equal(scanFrontendSource("apps/web/src/pages/../config.ts", deploymentRead).length, 1);
  assert.equal(scanFrontendSource("apps/web/src/../vite.config.ts", deploymentRead).length, 1);
  assert.equal(scanFrontendSource("apps\\web\\src\\config.ts", deploymentRead).length, 1);
  assert.equal(scanFrontendSource("outside/apps/web/src/config.ts", deploymentRead).length, 1);
});

test("purpose-limited files reject both reviewer alias probes", () => {
  const loginFile = new URL("../src/pages/LoginPage.tsx", import.meta.url).pathname;
  const stripeFile = new URL("../src/lib/stripe.ts", import.meta.url).pathname;
  assert.equal(scanFrontendSource(loginFile, "const root = import.meta; root.env.DEV").length, 1);
  assert.equal(scanFrontendSource(stripeFile, "const root = import.meta; root.env.VITE_STRIPE_PUBLISHABLE_KEY").length, 1);
});

test("scanner permits semantic code and exact-purpose environment exceptions only", () => {
  const ordinaryFile = new URL("../src/services/ordinary.ts", import.meta.url).pathname;
  assert.deepEqual(scanFrontendSource(ordinaryFile, 'resolveEnvironmentContract({ deployEnv: "preview" })'), []);
  assert.deepEqual(scanFrontendSource(ordinaryFile, 'const text = "import.meta.env.VITE_API_ORIGIN"'), []);
  assert.deepEqual(scanFrontendSource(ordinaryFile, "// process.env.VITE_SOCKET_URL\nconst value = 1"), []);

  const loginFile = new URL("../src/pages/LoginPage.tsx", import.meta.url).pathname;
  assert.deepEqual(scanFrontendSource(loginFile, "const enabled = import.meta.env.DEV"), []);
  assert.equal(scanFrontendSource(loginFile, "const value = import.meta.env.VITE_API_ORIGIN").length, 1);
  assert.equal(scanFrontendSource(loginFile, "const value = import.meta.env.OTHER").length, 1);

  const stripeFile = new URL("../src/lib/stripe.ts", import.meta.url).pathname;
  assert.deepEqual(scanFrontendSource(stripeFile, "const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY"), []);
  assert.equal(scanFrontendSource(stripeFile, "const value = import.meta.env.VITE_SOCKET_URL").length, 1);
  assert.equal(scanFrontendSource(stripeFile, "const value = process.env.OTHER").length, 1);

  assert.deepEqual(
    [...AUTHORIZED_ENVIRONMENT_READERS].sort(),
    ["apps/web/src/config.ts", "apps/web/vite.config.ts"],
  );

  const configFile = new URL("../src/config.ts", import.meta.url).pathname;
  const viteConfigFile = new URL("../vite.config.ts", import.meta.url).pathname;
  assert.deepEqual(scanFrontendSource(configFile, "VITE_API_ORIGIN VITE_SOCKET_URL VITE_DEPLOY_ENV"), []);
  assert.deepEqual(scanFrontendSource(viteConfigFile, "VITE_API_ORIGIN VITE_SOCKET_URL VITE_DEPLOY_ENV"), []);

  const unauthorizedReader = new URL("../src/services/secondEnvironmentReader.ts", import.meta.url).pathname;
  assert.equal(scanFrontendSource(unauthorizedReader, "const value = process.env.OTHER").length, 1);
  const suffixCoincidence = new URL("../src/services/config.ts", import.meta.url).pathname;
  assert.equal(scanFrontendSource(suffixCoincidence, "import.meta.env.VITE_API_ORIGIN").length, 1);
  const basenameCoincidence = new URL("../src/services/vite.config.ts", import.meta.url).pathname;
  assert.equal(scanFrontendSource(basenameCoincidence, "import.meta.env.VITE_API_ORIGIN").length, 1);
  const traversalCoincidence = "apps/web/src/services/../services/config.ts";
  assert.equal(scanFrontendSource(traversalCoincidence, "import.meta.env.VITE_API_ORIGIN").length, 1);
  const windowsCoincidence = "apps\\web\\src\\services\\config.ts";
  assert.equal(scanFrontendSource(windowsCoincidence, "import.meta.env.VITE_API_ORIGIN").length, 1);
});

test("founding-shop service consumes the authoritative Preview staging API_BASE", async () => {
  const { createServer } = await import("vite");
  const source = readFileSync(new URL("../src/services/foundingShopProgram.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ API_BASE \} from "\.\.\/config"/);
  assert.match(source, /buildFoundingShopProgramUrl\(apiBase = API_BASE\)/);
  const priorApiPathAlias = process.env.VITE_API_BASE_URL;
  process.env.VITE_API_BASE_URL = "/parent-environment-must-not-leak";
  let vite;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  try {
    vite = await createServer({
      root: new URL("../", import.meta.url).pathname,
      configFile: false,
      envFile: false,
      logLevel: "silent",
      server: { middlewareMode: true },
      define: {
        "import.meta.env.DEV": "false",
        "import.meta.env.VITE_DEPLOY_ENV": JSON.stringify("preview"),
        "import.meta.env.VITE_API_ORIGIN": JSON.stringify("https://pawnshop-staging-api.onrender.com"),
        "import.meta.env.VITE_API_BASE": JSON.stringify("/api"),
        "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/api"),
        "import.meta.env.VITE_SOCKET_URL": JSON.stringify("https://pawnshop-staging-api.onrender.com"),
        "import.meta.env.VITE_SOCKET_PATH": JSON.stringify("/socket.io"),
      },
    });
    const module = await vite.ssrLoadModule("/src/services/foundingShopProgram.ts");
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ program: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await module.getFoundingShopProgramSettings();
    assert.equal(requestedUrl, "https://pawnshop-staging-api.onrender.com/api/platform-settings/founding-shop-program");
  } finally {
    globalThis.fetch = originalFetch;
    if (priorApiPathAlias === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = priorApiPathAlias;
    if (vite) await vite.close();
  }
});
