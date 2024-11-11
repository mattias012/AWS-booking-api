module.exports.handler = async (event) => {
    // Mockup response for creating a booking
    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Booking created!" }),
    };
  };
  