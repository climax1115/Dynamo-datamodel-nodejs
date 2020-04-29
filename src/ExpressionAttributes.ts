import { ExpressionAttributeNameMap } from 'aws-sdk/clients/dynamodb';
import { Table } from './Table';

export class ExpressionAttributes {
  static validAttributeNameRegEx = /^[A-Za-z][A-Za-z0-9]*$/;
  static isValidAttributeName(name: string): boolean {
    return ExpressionAttributes.validAttributeNameRegEx.test(name);
  }

  isReservedName: (name: string) => boolean = () => false;
  isValidName: (name: string) => boolean = () => false;
  treatNameAsPath = true;
  names: ExpressionAttributeNameMap = {};
  nextName = 0;
  values: Table.AttributeValuesMap = {};
  nextValue = 0;

  private addName(name: string): string {
    const names = this.names;
    if (this.isReservedName(name)) {
      const attName = `#${name}`;
      names[attName] = name;
      return attName;
    } else if (!this.isValidName(name)) {
      for (const key in names) {
        if (names[key] === name) {
          return key;
        }
      }
      const attName = `#n${this.nextName++}`;
      names[attName] = name;
      return attName;
    }
    return name;
  }

  addPath(name: string): string {
    // split '.' and '[]' then add each and append with '.'
    if (this.treatNameAsPath) {
      const pathList = name.split('.').reduce((prev, curr) => {
        if (curr.endsWith(']')) {
          const beginBracket = curr.indexOf('[');
          const listName = this.addName(curr.substring(0, beginBracket));
          prev.push(`${listName}${curr.substring(beginBracket)}`);
        } else {
          prev.push(this.addName(curr));
        }
        return prev;
      }, new Array<string>());
      return pathList.join('.');
    }
    return this.addName(name);
  }

  addValue(value: Table.AttributeValues): string {
    const name = `:v${this.nextValue++}`;
    this.values[name] = value;
    return name;
  }

  getPaths(): ExpressionAttributeNameMap {
    return this.names;
  }
  getValues(): Table.AttributeValuesMap {
    return this.values;
  }

  reset(): void {
    this.names = {};
    this.nextName = 0;
    this.values = {};
    this.nextValue = 0;
  }

  addParams(input: {
    ExpressionAttributeNames?: ExpressionAttributeNameMap;
    ExpressionAttributeValues?: Table.AttributeValuesMap;
  }): {
    ExpressionAttributeNames?: ExpressionAttributeNameMap;
    ExpressionAttributeValues?: Table.AttributeValuesMap;
  } {
    if (Object.keys(this.names).length > 0) input.ExpressionAttributeNames = this.names;
    if (Object.keys(this.values).length > 0) input.ExpressionAttributeValues = this.values;
    return input;
  }
}
