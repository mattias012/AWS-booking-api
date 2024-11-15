// Importera AWS SDK för att använda DynamoDB DocumentClient
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

// Definiera huvudfunktionen som hanterar HTTP-förfrågningar
module.exports.handler = async (event) => {
  const { roomType, startDate, endDate } = event.queryStringParameters || {};

  // Kontrollera att startDate och endDate finns (de är alltid nödvändiga)
  if (!startDate || !endDate) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "startDate and endDate query parameters are required" }),
    };
  }

  try {
    let data;

    if (roomType) {
      // Om roomType är angett, använd query för att söka efter specifika rumstyper inom datumintervallet
      const params = {
        TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
        IndexName: 'RoomTypeIndex',
        KeyConditionExpression: 'roomType = :roomType AND checkInDate BETWEEN :startDate AND :endDate',
        ExpressionAttributeValues: {
          ':roomType': roomType,
          ':startDate': startDate,
          ':endDate': endDate,
        }
      };
      data = await dynamoDb.query(params).promise();
    } else {
      // Om roomType är utelämnat, använd scan för att hämta alla bokningar inom datumintervallet
      const params = {
        TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
        FilterExpression: 'checkInDate BETWEEN :startDate AND :endDate',
        ExpressionAttributeValues: {
          ':startDate': startDate,
          ':endDate': endDate,
        }
      };
      data = await dynamoDb.scan(params).promise();
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "Could not retrieve bookings", details: error.message }),
    };
  }
};

/*endpoints:
POST - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/bookings
GET - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/bookings/{id}
GET - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/allBookings
      add params: roomType: single, double, suite (for 1, 2 or 3 persons) if left empty, all bookings are returned within the dates.
                  stardDate: 2024-11-01 (example)
                  endDate: 2024-12-01 (example)

PUT - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/bookings/{id}
DELETE - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/bookings/{id}
GET - https://1hi02qvduj.execute-api.eu-north-1.amazonaws.com/dev/rooms/availability
functions:
createBooking: booking-api-dev-createBooking (50 MB)
getBooking: booking-api-dev-getBooking (50 MB)
allBookings: booking-api-dev-allBookings (50 MB)
updateBooking: booking-api-dev-updateBooking (50 MB)
deleteBooking: booking-api-dev-deleteBooking (50 MB)
getAvailableRooms: booking-api-dev-getAvailableRooms (50 MB)
*/