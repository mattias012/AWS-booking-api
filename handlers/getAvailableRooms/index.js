const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.getAvailableRooms = async (event) => {
  const { roomType, date } = event.queryStringParameters;

  const params = {
    TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
    KeyConditionExpression: 'roomType = :roomType and date = :date',
    ExpressionAttributeValues: {
      ':roomType': roomType,
      ':date': date,
    },
  };

  const result = await dynamoDb.query(params).promise();
  return {
    statusCode: 200,
    body: JSON.stringify(result.Items),
  };
};

  