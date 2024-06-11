

const express = require('express');
const dotenv = require('dotenv');
const { faker } = require('@faker-js/faker');
const { Client } = require("pg");
const { CronJob } = require("cron");
const nodemailer = require("nodemailer");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
    connectionString: process.env.DATABASE_CONNECTION,
    ssl: {
        rejectUnauthorized: false,
    }
});

client
    .connect()
    .then(() => console.log("Connected"))
    .catch((e) => console.log("Error", e));

app.use(express.json());

app.get('/', (req, res) => {
    res.send("Hello, world!");
});

const transporter = nodemailer.createTransport({
    service: "outlook",
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    }
});

const sendSalesEmail = async (salesData) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: 'Hourly Sales Data',
        text: `Here is the sales data for the last hour:\n\n${JSON.stringify(salesData, null, 2)}`

    };
    try {
        await transporter.sendMail(mailOptions);
        console.log('Sales data email sent successfully');
    } catch (error) {
        console.error('Error sending sales data email:', error);
    }
};


const cornJob = new CronJob(
    '* * * * *', // cronTime

    async function () {
        try {
            const result = await client.query('SELECT * FROM Sales');
            console.log('Sales data:', result.rows);

            await sendSalesEmail(result.rows)
        } catch (err) {
            console.error('Error fetching sales data:', err.stack);
        }
    },
    null, // onComplete
    true, // start
    'America/Los_Angeles' // timeZone
);

app.get('/test-connection', async (req, res) => {
    try {
        res.send({ Msg: "succesfuly connections!" })
    } catch (err) {
        console.error('Error connecting to the database', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

const createFakeData = async () => {
    try {
        await client.query('BEGIN');

        const usedEmails = new Set();

        for (let i = 0; i < 200; i++) {
            let email;
            do {
                email = faker.internet.email();
            } while (usedEmails.has(email));
            usedEmails.add(email);

            const query = 'INSERT INTO customers(FirstName, LastName, Email, Phone) VALUES ($1, $2, $3, $4)';
            const values = [faker.person.firstName(), faker.person.lastName(), email, faker.phone.imei()];
            await client.query(query, values);
        }

        for (let i = 0; i < 200; i++) {
            const query = 'INSERT INTO products(Name, Price, StockQuantity) VALUES ($1, $2, $3)';
            const values = [faker.commerce.productName(), faker.commerce.price(), faker.number.int({ min: 0, max: 100 })];
            await client.query(query, values);
        }

        await client.query('COMMIT');
    } catch (e) {
        console.error('Error during data generation:', e);
        await client.query('ROLLBACK');
        throw e;
    }
};

app.post('/generate-fake-data', async (req, res) => {
    try {
        await createFakeData();
        res.status(201).send('Fake data generated successfully');
    } catch (err) {
        console.error('Error generating fake data', err.stack);
        res.status(500).send('Internal Server Error');
    }
});



// EndPoints for Products
//1-GET Products and with Pagination 
app.get('/products', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
    const offset = (page - 1) * limit;

    try {
        // Fetch the total number of items
        const totalItemsResult = await client.query('SELECT COUNT(*) FROM Products');
        const totalItems = parseInt(totalItemsResult.rows[0].count);

        // Fetch the items for the current page
        const query = 'SELECT * FROM Products ORDER BY ProductID ASC LIMIT $1 OFFSET $2';
        const values = [limit, offset];
        const result = await client.query(query, values);

        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            page,
            limit,
            totalItems,
            totalPages,
            data: result.rows,
        });
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

//2-Delete Product
app.delete('/delete-product/:id', async (req, res) => {
    const productId = parseInt(req.params.id);

    if (!Number.isInteger(productId)) {
        return res.status(400).send('Invalid product ID.');
    }

    try {
        const query = 'DELETE FROM products WHERE ProductID = $1 RETURNING *';
        const values = [productId];

        const result = await client.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).send('Product not found.');
        }

        res.status(200).json('Product Was deleted');
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
})
//3-Post Product
app.post('/create-product', async (req, res) => {
    const { name, price, stockQuantity } = req.body;
    if (!name || !price || !stockQuantity) {
        return res.status(400).send('Name, price, and stockQuantity are required.');
    }
    try {
        const query = 'INSERT INTO products(Name, Price, StockQuantity) VALUES ($1, $2, $3) RETURNING *';
        const valuse = [name, price, stockQuantity];
        const result = await client.query(query, valuse);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('Error executing query', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

//4-Put Product
app.put("/edit-product/:ProductId", async (req, res) => {
    const { ProductId } = req.params;
    const { name, price, stockQuantity } = req.body;

    if (!name || !price || !stockQuantity) {
        return res.status(400).send('Name, price, and stockQuantity are required.');
    }

    try {
        const query = 'UPDATE Products Set Name=$1, Price=$2, StockQuantity = $3 WHERE ProductID = $4 RETURNING *';
        const values = [name, price, stockQuantity, parseInt(ProductId)];

        const result = await client.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).send('Product not found.');
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
});



//EndPoints for Customers 
//1-Get All Customers
app.get('/customers', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM Customers');
        res.json(result.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

//2-Create New Customer 
app.post('/create-customer', async (req, res) => {
    const { FirstName, LastName, Email, Phone } = req.body;
    if (!FirstName || !LastName || !Email || !Phone) {
        return res.status(400).send('FirstName, LastName, Email, and Phone are required.');
    }
    try {
        const query = 'INSERT INTO Customers(FirstName, LastName, Email, Phone) VALUES($1, $2, $3, $4) RETURNING *';
        const values = [FirstName, LastName, Email, Phone];
        const result = await client.query(query, values);
        res.status(201).json(result.rows[0]);
        // return res.status(201).send('Cusomer added succesfily! ');
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
});

//3-update customer 
app.put('/edit-customer/:CustomerId', async (req, res) => {
    const { CustomerId } = req.params;
    const { FirstName, LastName, Email, Phone } = req.body;
    if (!FirstName || !LastName || !Email || !Phone) {
        return res.status(400).send('FirstName, LastName, Email, and Phone are required.');
    }
    try {
        const query = 'UPDATE Customers SET FirstName=$1, LastName=$2, Email=$3, Phone=$4 WHERE CustomerId=$5 RETURNING *';
        const values = [FirstName, LastName, Email, Phone, parseInt(CustomerId)];
        const result = await client.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).send('Customer not found.');
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
});



//EndPoint for sales
//1-Get Sales
app.get('/sales', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM Sales');
        res.json(result.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).send('Internal Server Error');
    }
});
//2-Post (create sale)
app.post('/create-sale', async (req, res) => {
    const { CustomerID, TotalAmount } = req.body;

    if (!CustomerID || !TotalAmount) {
        return res.status(400).send('CustomerID and TotalAmount are required.');
    }

    try {
        const query = 'INSERT INTO sales (CustomerID, TotalAmount) VALUES ($1, $2) RETURNING *';
        const values = [CustomerID, TotalAmount];
        const result = await client.query(query, values);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
});

//EndPoint for salesIt
//1-Get saleItems

app.get('/saleItems', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM SaleItems');
        res.json(result.rows);
    } catch (error) {
        console.error('errorexecuting query', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

//2-Post saleItems
app.post('/create-saleitem', async (req, res) => {
    const { SaleID, ProductID, Quantity, UnitPrice, TotalPrice } = req.body;

    if (!SaleID || !ProductID || !Quantity || !UnitPrice || !TotalPrice) {
        return res.status(400).send('SaleID, ProductID, Quantity, UnitPrice, and TotalPrice are required.');
    }

    try {
        const query = 'INSERT INTO saleitems (SaleID, ProductID, Quantity, UnitPrice, TotalPrice) VALUES ($1, $2, $3, $4, $5) RETURNING *';
        const values = [SaleID, ProductID, Quantity, UnitPrice, TotalPrice];
        const result = await client.query(query, values);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error executing query', error.stack);
        res.status(500).send('Internal Server Error');
    }
});



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
