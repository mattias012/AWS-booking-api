const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// Skapa en DynamoDB-klient och en DynamoDBDocument-klient
const client = new DynamoDBClient({ region: process.env.REGION });
const dynamoDb = DynamoDBDocumentClient.from(client);

const roomsTableName = process.env.DYNAMODB_ROOMS_TABLE;
const availabilityTableName = process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE;

// Rumsdata som ska laddas upp
const rooms = [
  { roomType: "single", capacity: 1, pricePerNight: 500, availableRooms: 10 },
  { roomType: "double", capacity: 2, pricePerNight: 1000, availableRooms: 8 },
  { roomType: "suite", capacity: 3, pricePerNight: 1500, availableRooms: 2 },
];

// Funktion för att radera all data från en tabell
const deleteAllItemsFromTable = async (tableName) => {
  const scanParams = { TableName: tableName };

  try {
    const data = await dynamoDb.send(new ScanCommand(scanParams));
    if (data.Items.length === 0) {
      console.log(`No items to delete in ${tableName}`);
      return;
    }

    const deletePromises = data.Items.map((item) => {
      const deleteParams = {
        TableName: tableName,
        Key: { roomType: item.roomType, date: item.date },
      };
      return dynamoDb.send(new DeleteCommand(deleteParams));
    });

    await Promise.all(deletePromises);
    console.log(`All items deleted from ${tableName}`);
  } catch (error) {
    console.error(`Error deleting items from ${tableName}:`, error);
  }
};

// Lägger till rum i rums-tabellen
const uploadRooms = async () => {
  await deleteAllItemsFromTable(roomsTableName);

  for (const room of rooms) {
    const params = {
      TableName: roomsTableName,
      Item: { ...room, roomId: uuidv4() },
    };

    try {
      await dynamoDb.send(new PutCommand(params));
      console.log(`Added room type: ${room.roomType}`);
    } catch (error) {
      console.error(`Failed to add room type: ${room.roomType}`, error);
    }
  }
};

// Lägger till tillgänglighet per datum
// Lägger till tillgänglighet per datum
const uploadRoomAvailability = async () => {
  await deleteAllItemsFromTable(availabilityTableName);

  const today = new Date();
  const daysToAdd = 30;

  for (const room of rooms) {
    for (let i = 0; i < daysToAdd; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const availabilityParams = {
        TableName: availabilityTableName,
        Item: {
          roomType: room.roomType,
          date: date.toISOString().split("T")[0], // YYYY-MM-DD format
          availableRooms: room.availableRooms,
          bookingIds: []  // Initialize bookingIds as an empty list for each date
        },
      };

      try {
        await dynamoDb.send(new PutCommand(availabilityParams));
        console.log(`Added availability for ${room.roomType} on ${availabilityParams.Item.date}`);
      } catch (error) {
        console.error(`Failed to add availability for ${room.roomType} on ${availabilityParams.Item.date}`, error);
      }
    }
  }
};

// Kör funktionerna för att ladda upp rums- och tillgänglighetsdata
const main = async () => {
  await uploadRooms();
  await uploadRoomAvailability();
};

main().catch((error) => console.error("Error in uploadRooms script:", error));
