const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
require('dotenv').config();

const client = new DynamoDBClient({ region: process.env.REGION }); // Lägg till region här
const dynamoDb = DynamoDBDocumentClient.from(client);

const tableName = process.env.DYNAMODB_ROOMS_TABLE;

const rooms = [
  ...Array.from({ length: 10 }, (_, i) => ({
    roomId: `single_${i + 1}`,
    roomType: 'single',
    capacity: 1,
    pricePerNight: 500,
    status: 'available',
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    roomId: `double_${i + 1}`,
    roomType: 'double',
    capacity: 2,
    pricePerNight: 1000,
    status: 'available',
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    roomId: `suite_${i + 1}`,
    roomType: 'suite',
    capacity: 3,
    pricePerNight: 1500,
    status: 'available',
  })),
];

const uploadRooms = async () => {
  for (const room of rooms) {
    const params = {
      TableName: tableName,
      Item: room,
    };
    try {
      await dynamoDb.send(new PutCommand(params));
      console.log(`Added room: ${room.roomId}`);
    } catch (error) {
      console.error(`Failed to add room: ${room.roomId}`, error);
    }
  }
};

uploadRooms();
