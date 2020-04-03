import { BinaryValue, StringSetValue, NumberSetValue, BinarySetValue, ListValue, MapValue } from '../src/Common';
import { Model, Schema } from '../src/Model';
import {
  Update,
  UpdateInput,
  UpdateString,
  UpdateNumber,
  UpdateBoolean,
  UpdateBinary,
  UpdateStringSet,
  UpdateNumberSet,
  UpdateBinarySet,
  UpdateList,
  UpdateMap,
} from '../src/Update';
import { TableBase, Table, IndexBase, Index } from '../src/Table';
import { AWSError } from 'aws-sdk/lib/error';
import { Request } from 'aws-sdk/lib/Request';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import * as yup from 'yup';
import { delay } from './testCommon';

const client = new DocumentClient({ convertEmptyValues: true });
const request = (out: any) => {
  return {
    promise() {
      return delay(1, out);
    },
  } as Request<DocumentClient.GetItemOutput, AWSError>;
};

it('Validate Model exports', () => {
  expect(typeof Model).toBe('function');
});

describe('Validate Model with Table and Indexes', () => {
  interface TableKey {
    P: Table.StringPartitionKey;
    S?: Table.StringSortKey;
  }

  interface GSI0Key {
    G0P: Table.StringPartitionKey;
    G0S?: Table.StringSortKey;
  }

  interface LSI0Key {
    P: Table.StringPartitionKey;
    L0S?: Table.NumberSortKey;
  }

  interface TableAttributes extends TableKey, GSI0Key, LSI0Key {}

  const gsi0 = new Index<GSI0Key>({
    name: 'GSI0',
    keySchema: {
      G0P: { keyType: Table.PrimaryKeyType.Hash },
      G0S: { keyType: Table.PrimaryKeyType.Range },
    },
    projection: { type: Table.ProjectionType.All },
  });

  const lsi0 = new Index<LSI0Key>({
    name: 'LSI0',
    keySchema: {
      P: { keyType: Table.PrimaryKeyType.Hash },
      L0S: { keyType: Table.PrimaryKeyType.Range },
    },
    projection: { type: Table.ProjectionType.All },
  });

  const table = new Table<TableKey, TableAttributes>({
    name: 'MainTable',
    keyAttributes: {
      P: { type: Table.PrimaryAttributeType.String },
      S: { type: Table.PrimaryAttributeType.String },
      G0P: { type: Table.PrimaryAttributeType.String },
      G0S: { type: Table.PrimaryAttributeType.String },
      L0S: { type: Table.PrimaryAttributeType.Number },
    },
    keySchema: {
      P: { keyType: Table.PrimaryKeyType.Hash },
      S: { keyType: Table.PrimaryKeyType.Range },
    },
    globalIndexes: [gsi0 as IndexBase],
    localIndexes: [lsi0 as IndexBase],
    client,
  });

  // Multiple fields get written to a single attribute, then usually that attribute is
  // the sort key for a secondary index
  // This means composite keys need some conversion between the model and table data
  const location = Schema.namedComposite('G0S', {
    city: 0,
    state: 1,
    country: 2,
  });

  // Types to Test:
  // x split
  // x composite
  // x string
  // x number
  // x boolean
  // - ? null
  // x binary
  // x string set
  // x number set
  // - binary set
  // x list
  // x map
  // x object
  // x date
  // - custom
  // - ... (remainder) args

  // Field methods:
  // x alias
  // - hidden
  // - default
  // - required
  // - validation - regex, yup, joi, ajv
  //   - validateAsync(value, options): value
  // - coerce/convert - simple, yup, joi, ajv
  //

  interface ChildModel {
    name: string;
    age: number;
    adult: boolean;
  }

  const childSchema = {
    name: Schema.string(),
    age: Schema.number(),
    adult: Schema.boolean(),
  };

  interface SpouseModel {
    name: string;
    age: number;
    married: boolean;
  }

  const spouseSchema = {
    name: Schema.string(),
    age: Schema.number(),
    married: Schema.boolean(),
  };

  enum Role {
    Guest = 0,
    Member = 1,
    Leader = 2,
    Admin = 3,
  }

  interface GroupModel {
    role: Role;
  }

  const groupSchema = {
    role: Schema.number(),
  };

  interface UserKey {
    id: string;
  }

  interface UserModel extends UserKey {
    city?: string;
    state?: string;
    country?: string;
    name: string | UpdateString;
    count?: number | UpdateNumber;
    description?: string | UpdateString;
    revision: number | UpdateNumber;
    adult: boolean | UpdateBoolean;
    photo?: BinaryValue | UpdateBinary;
    interests?: StringSetValue | UpdateStringSet;
    modified?: NumberSetValue | UpdateNumberSet;
    spouse?: SpouseModel | UpdateMap;
    children?: ChildModel[] | UpdateList;
    groups?: { [key: string]: GroupModel } | UpdateMap;
    created?: Date | UpdateInput<'Date'>;
    hide?: Set<Date>;
    nickname?: string | UpdateString;
    range?: number | UpdateNumber;
  }

  const userSchema = {
    id: Schema.split(['P', 'S']),
    city: location.slots.city(),
    state: location.slots.state(),
    country: location.slots.country(),
    name: Schema.string(),
    count: Schema.number(),
    description: Schema.string('desc'),
    revision: Schema.number('rev'),
    adult: Schema.boolean(),
    photo: Schema.binary(),
    interests: Schema.stringSet(),
    modified: Schema.numberSet(),
    children: Schema.listT<ChildModel, 'Child'>('Child', childSchema),
    spouse: Schema.object<SpouseModel, 'Spouse'>('Spouse', spouseSchema),
    groups: Schema.mapT<GroupModel, 'Groups'>('Groups', groupSchema),
    created: Schema.date(),
    hide: Schema.hidden(),
    nickname: Schema.string().default('none'),
    range: Schema.number().yup(yup.number().integer().positive()),
  };

  const userModel = new Model<UserKey, UserModel>({
    schema: userSchema,
    table: table as TableBase,
  });

  describe('model params', () => {
    it('Model.getParams with single id', async () => {
      // TODO: should probably throw in SplitField
      const params = await userModel.getParams({ id: 'id1' });
      expect(params).toEqual({
        Key: {
          P: 'id1',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.getParams with multiple id', async () => {
      // TODO: should probably throw in SplitField
      const params = await userModel.getParams({ id: 'id1.id2.id3.id4' });
      expect(params).toEqual({
        Key: {
          P: 'id1.id2.id3',
          S: 'id4',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.getParams with single id', async () => {
      const params = await userModel.getParams({ id: 'id1.id2' });
      expect(params).toEqual({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.deleteParams', async () => {
      const params = await userModel.deleteParams({ id: 'id1.id2' });
      expect(params).toEqual({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.putParams with min fields', async () => {
      const params = await userModel.putParams({
        id: 'id1.id2',
        name: 'name1',
        revision: 1,
        adult: true,
      });
      expect(params).toEqual({
        Item: {
          P: 'id1',
          S: 'id2',
          name: 'name1',
          rev: 1,
          adult: true,
          nickname: 'none',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.putParams with all fields', async () => {
      const params = await userModel.putParams({
        id: 'id1.id2',
        name: 'name1',
        revision: 1,
        adult: true,
        city: 'new york',
        state: 'new york',
        country: 'usa',
        description: 'user desription',
        count: 2,
        created: new Date(1585563302000),
        photo: Buffer.from('abcdefghijklmn'),
        spouse: { age: 40, married: true, name: 'spouse' },
        children: [
          {
            name: 'child1',
            age: 7,
            adult: false,
          },
          {
            name: 'child2',
            age: 10,
            adult: false,
          },
        ],
        modified: userModel.createNumberSet([1585553302, 1585563302]),
        interests: userModel.createStringSet(['basketball', 'soccer', 'football']),
        groups: { group1: { role: Role.Guest }, group3: { role: Role.Member } },
        hide: new Set([new Date(), new Date()]),
        //range: -1,
      });
      expect(params).toEqual({
        Item: {
          G0S: 'new york.new york.usa',
          P: 'id1',
          S: 'id2',
          adult: true,
          children: [
            {
              name: 'child1',
              age: 7,
              adult: false,
            },
            {
              name: 'child2',
              age: 10,
              adult: false,
            },
          ],
          count: 2,
          created: 1585563302,
          desc: 'user desription',
          groups: {
            group1: {
              role: 0,
            },
            group3: {
              role: 1,
            },
          },
          interests: userModel.createStringSet(['basketball', 'soccer', 'football']),
          modified: userModel.createNumberSet([1585553302, 1585563302]),
          name: 'name1',
          nickname: 'none',
          photo: Buffer.from('abcdefghijklmn'),
          rev: 1,
          spouse: {
            age: 40,
            married: true,
            name: 'spouse',
          },
        },
        TableName: 'MainTable',
      });
    });

    it('Model.updateParams min args', async () => {
      const params = await userModel.updateParams({
        id: 'id1.id2',
      });
      expect(params).toEqual({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
    });

    it('Model.updateParams with all fields', async () => {
      const params = await userModel.updateParams({
        id: 'id1.id2',
        name: Update.set('new name'),
        revision: Update.inc(1),
        city: 'kirkland',
        state: 'wa',
        country: 'usa',
        created: new Date(1585553302000),
        description: null,
        adult: Update.del(),
        count: Update.add('revision', 3),
        spouse: Update.map({
          age: Update.dec(1),
          married: Update.del(),
          name: 'new spouse',
        }),
        children: Update.prepend([{ name: 'child3', age: 3, adult: false }]),
        photo: Update.path('photo'),
        modified: Update.addToSet(userModel.createNumberSet([1585533302, 1585543302])),
        interests: Update.removeFromSet(userModel.createStringSet(['soccer', 'football'])),
        groups: Update.map({
          group1: Update.del(),
          'group3.role': Role.Leader,
          group4: { role: Role.Admin },
        }),
      });
      expect(params).toEqual({
        ExpressionAttributeNames: {
          '#n0': 'G0S',
          '#n1': 'name',
          '#n10': 'children',
          '#n11': 'spouse',
          '#n12': 'age',
          '#n13': 'married',
          '#n14': 'groups',
          '#n15': 'group1',
          '#n16': 'group3',
          '#n17': 'role',
          '#n18': 'group4',
          '#n19': 'created',
          '#n2': 'count',
          '#n3': 'revision',
          '#n4': 'desc',
          '#n5': 'rev',
          '#n6': 'adult',
          '#n7': 'photo',
          '#n8': 'interests',
          '#n9': 'modified',
        },
        ExpressionAttributeValues: {
          ':v0': 'kirkland.wa.usa',
          ':v1': 'new name',
          ':v10': {
            role: 3,
          },
          ':v11': 1585553302,
          ':v2': 3,
          ':v3': 1,
          ':v4': userModel.createStringSet(['soccer', 'football']),
          ':v5': userModel.createNumberSet([1585533302, 1585543302]),
          ':v6': [
            {
              adult: false,
              age: 3,
              name: 'child3',
            },
          ],
          ':v7': 1,
          ':v8': 'new spouse',
          ':v9': 2,
        },
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
        UpdateExpression:
          'SET #n0 = :v0, #n1 = :v1, #n2 = #n3 + :v2, #n5 = #n5 + :v3, #n7 = #n7, #n10 = list_append(:v6, #n10), #n11.#n12 = #n11.#n12 - :v7, #n11.#n1 = :v8, #n14.#n16.#n17 = :v9, #n14.#n18 = :v10, #n19 = :v11 REMOVE #n4, #n6, #n11.#n13, #n14.#n15 ADD #n9 :v5 DELETE #n8 :v4',
      });
    });
  });

  describe('model actions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('Model.get with single id', async () => {
      client.get = jest.fn((params) => request({ Item: { P: 'id1' } }));
      // TODO: should probably throw in SplitField
      const results = await userModel.get({ id: 'id1' });
      expect(results).toEqual({ id: 'id1' });
      expect(client.get).toBeCalledWith({
        Key: { P: 'id1' },
        TableName: 'MainTable',
      });
      expect(client.get).toBeCalledTimes(1);
    });

    it('Model.get with multiple id', async () => {
      client.get = jest.fn((params) => request({ Item: { P: 'id1.id2.id3', S: 'id4' } }));
      const results = await userModel.get({ id: 'id1.id2.id3.id4' });
      expect(results).toEqual({ id: 'id1.id2.id3.id4' });
      expect(client.get).toBeCalledWith({
        Key: { P: 'id1.id2.id3', S: 'id4' },
        TableName: 'MainTable',
      });
      expect(client.get).toBeCalledTimes(1);
    });

    it('Model.get with single id', async () => {
      client.get = jest.fn((params) => request({ Item: { P: 'id1', S: 'id2' } }));
      const results = await userModel.get({ id: 'id1.id2' });
      expect(results).toEqual({ id: 'id1.id2' });
      expect(client.get).toBeCalledWith({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
      expect(client.get).toBeCalledTimes(1);
    });

    it('Model.get with full data', async () => {
      client.get = jest.fn((params) =>
        request({
          Item: {
            G0S: 'new york.new york.usa',
            P: 'id1',
            S: 'id2',
            adult: true,
            children: [
              {
                name: 'child1',
                age: 7,
                adult: false,
              },
              {
                name: 'child2',
                age: 10,
                adult: false,
              },
            ],
            count: 2,
            created: 1585563302,
            desc: 'user desription',
            groups: {
              group1: {
                role: 0,
              },
              group3: {
                role: 1,
              },
            },
            interests: userModel.createStringSet(['basketball', 'soccer', 'football']),
            modified: userModel.createNumberSet([1585553302, 1585563302]),
            name: 'name1',
            photo: Buffer.from('abcdefghijklmn'),
            rev: 1,
            spouse: {
              age: 40,
              married: true,
              name: 'spouse',
            },
          },
        }),
      );
      const results = await userModel.get({ id: 'id1.id2' });
      expect(results).toEqual({
        adult: true,
        children: [
          {
            adult: false,
            age: 7,
            name: 'child1',
          },
          {
            adult: false,
            age: 10,
            name: 'child2',
          },
        ],
        city: 'new york',
        count: 2,
        country: 'usa',
        created: new Date('2020-03-30T10:15:02.000Z'),
        description: 'user desription',
        groups: {
          group1: {
            role: 0,
          },
          group3: {
            role: 1,
          },
        },
        id: 'id1.id2',
        interests: userModel.createStringSet(['basketball', 'soccer', 'football']),
        modified: userModel.createNumberSet([1585553302, 1585563302]),
        name: 'name1',
        photo: Buffer.from('abcdefghijklmn'),
        revision: 1,
        spouse: {
          age: 40,
          married: true,
          name: 'spouse',
        },
        state: 'new york',
      });
      expect(client.get).toBeCalledWith({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
      expect(client.get).toBeCalledTimes(1);
    });

    it('Model.delete', async () => {
      client.delete = jest.fn((params) => request({ Attributes: { P: 'id1', S: 'id2' } }));
      const results = await userModel.delete({ id: 'id1.id2' });
      expect(results).toEqual({ id: 'id1.id2' });
      expect(client.delete).toBeCalledWith({
        Key: { P: 'id1', S: 'id2' },
        TableName: 'MainTable',
      });
      expect(client.delete).toBeCalledTimes(1);
    });

    it('Model.put', async () => {
      client.put = jest.fn((params) => request({ Attributes: { P: 'id1', S: 'id2' } }));
      const results = await userModel.put({
        id: 'id1.id2',
        name: 'name1',
        revision: 1,
        adult: true,
      });
      expect(results).toEqual({
        adult: true,
        id: 'id1.id2',
        name: 'name1',
        nickname: 'none',
        revision: 1,
      });
      expect(client.put).toBeCalledWith({
        Item: {
          adult: true,
          P: 'id1',
          S: 'id2',
          name: 'name1',
          nickname: 'none',
          rev: 1,
        },
        TableName: 'MainTable',
      });
      expect(client.put).toBeCalledTimes(1);
    });

    it('Model.update min args', async () => {
      client.update = jest.fn((params) => request({ Attributes: { P: 'id1', S: 'id2' } }));
      const results = await userModel.update({
        id: 'id1.id2',
      });
      expect(results).toEqual({ id: 'id1.id2' });
      expect(client.update).toBeCalledWith({
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
      });
      expect(client.update).toBeCalledTimes(1);
    });

    it('Model.update with all fields', async () => {
      client.update = jest.fn((params) =>
        request({
          Attributes: {
            P: 'id1',
            S: 'id2',
            rev: 2,
            G0S: 'hudson.wi.usa',
            created: 1585553202,
          },
        }),
      );
      const results = await userModel.update({
        id: 'id1.id2',
        name: 'new name',
        revision: Update.inc(1),
        city: 'kirkland',
        state: 'wa',
        country: 'usa',
        created: new Date(1585553302000),
      });
      expect(results).toEqual({
        id: 'id1.id2',
        revision: 2,
        city: 'hudson',
        state: 'wi',
        country: 'usa',
        created: new Date(1585553202000),
      });
      expect(client.update).toBeCalledWith({
        ExpressionAttributeNames: {
          '#n0': 'G0S',
          '#n1': 'name',
          '#n2': 'rev',
          '#n3': 'created',
        },
        ExpressionAttributeValues: {
          ':v0': 'kirkland.wa.usa',
          ':v1': 'new name',
          ':v2': 1,
          ':v3': 1585553302,
        },
        Key: {
          P: 'id1',
          S: 'id2',
        },
        TableName: 'MainTable',
        UpdateExpression: 'SET #n0 = :v0, #n1 = :v1, #n2 = #n2 + :v2, #n3 = :v3',
      });
      expect(client.update).toBeCalledTimes(1);
    });
  });
});
