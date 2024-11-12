// Import necessary modules from AWS SDK v3
const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require("uuid");

// Initialize DynamoDBClient
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

module.exports.handler = async (event) => {
  // Parse incoming request body
  const { guestName, email, roomType, checkInDate, checkOutDate } = JSON.parse(event.body);
  const bookingId = uuidv4();  // Unique ID for booking

  // Calculate number of nights
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  // Check availability for each day in the date range
  const dateAvailabilityPromises = [];
  for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
    const formattedDate = d.toISOString().split('T')[0];

    // Define parameters for checking availability
    const checkAvailabilityParams = {
      TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
      Key: {
        roomType: { S: roomType },
        date: { S: formattedDate },
      },
    };

    // Use GetItemCommand to check room availability
    dateAvailabilityPromises.push(dynamoDbClient.send(new GetItemCommand(checkAvailabilityParams)));
  }

  try {
    // Wait for all date availability checks to complete
    const availabilityData = await Promise.all(dateAvailabilityPromises);

    // Check if there is any date without availability
    for (const data of availabilityData) {
      if (!data.Item || data.Item.availableRooms.N <= 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "No rooms available for the selected date range" }),
        };
      }
    }

    // Update room availability for each day in the date range
    const updateAvailabilityPromises = [];
    for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
      const formattedDate = d.toISOString().split('T')[0];

      // Define parameters for updating availability
      const updateAvailabilityParams = {
        TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
        Key: {
          roomType: { S: roomType },
          date: { S: formattedDate },
        },
        UpdateExpression: "SET availableRooms = availableRooms - :decrement",
        ExpressionAttributeValues: {
          ":decrement": { N: "1" },
          ":zero": { N: "0" },  // Correctly defined within the same object
        },
        ConditionExpression: "availableRooms > :zero",
      };

      // Use UpdateItemCommand to decrement available rooms
      updateAvailabilityPromises.push(dynamoDbClient.send(new UpdateItemCommand(updateAvailabilityParams)));
    }
    await Promise.all(updateAvailabilityPromises);

    // Create the booking record in the bookings table
    const newBooking = {
      bookingId: { S: bookingId },
      guestName: { S: guestName },
      email: { S: email },
      roomType: { S: roomType },
      checkInDate: { S: checkInDate },
      checkOutDate: { S: checkOutDate },
      nights: { N: nights.toString() },
      createdAt: { S: new Date().toISOString() },
    };
    const saveBookingParams = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Item: newBooking,
    };

    // Use PutItemCommand to save the booking
    await dynamoDbClient.send(new PutItemCommand(saveBookingParams));

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Booking created successfully!", bookingId }),
    };
  } catch (error) {
    console.error("Error creating booking:", error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create booking", details: error.message }),
    };
  }
};
