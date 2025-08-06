# N8N Logistics & Procurement API

A comprehensive RESTful API for managing logistics and procurement operations, designed for integration with N8N automation workflows and enterprise systems.

## 🚀 Features

### Procurement Management
- **Purchase Orders**: Create, manage, and track purchase orders with approval workflows
- **Vendor Management**: Comprehensive vendor database with performance tracking
- **Approval System**: Multi-level approval process with role-based authorization
- **Analytics**: Procurement dashboard with spending analysis and vendor performance

### Logistics Management
- **Shipment Tracking**: Real-time shipment tracking with carrier integration
- **Inventory Control**: Advanced inventory management with stock movements
- **Delivery Analytics**: Performance metrics and delivery reporting
- **Public Tracking**: Customer-facing tracking endpoints

### Core Features
- **Authentication**: JWT-based authentication with role-based access control
- **Data Validation**: Comprehensive input validation using Joi and express-validator
- **Error Handling**: Centralized error handling with detailed logging
- **Rate Limiting**: API rate limiting for security and performance
- **Pagination**: Efficient pagination for large datasets
- **Filtering & Sorting**: Advanced filtering and sorting capabilities

## 📋 Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Data Models](#data-models)
- [Usage Examples](#usage-examples)
- [N8N Integration](#n8n-integration)
- [Development](#development)
- [Contributing](#contributing)

## 🛠 Installation

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- npm or yarn

### Quick Start

1. **Clone the repository**
```bash
git clone <repository-url>
cd n8n-logistics-procurement-api
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or use your local MongoDB installation
```

5. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## ⚙️ Configuration

### Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/logistics_procurement

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# API Configuration
API_VERSION=v1
API_PREFIX=/api

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info

# External Services (optional)
SHIPPING_API_KEY=your_shipping_api_key
SUPPLIER_API_KEY=your_supplier_api_key
```

## 🔗 API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/api/v1/auth/register` | Register new user | Public |
| POST | `/api/v1/auth/login` | User login | Public |
| GET | `/api/v1/auth/me` | Get current user | Private |
| PUT | `/api/v1/auth/updatedetails` | Update user details | Private |
| PUT | `/api/v1/auth/updatepassword` | Update password | Private |
| POST | `/api/v1/auth/logout` | User logout | Private |

### Procurement

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/v1/procurement/purchase-orders` | Get purchase orders | Private |
| POST | `/api/v1/procurement/purchase-orders` | Create purchase order | Private |
| GET | `/api/v1/procurement/purchase-orders/:id` | Get purchase order | Private |
| PUT | `/api/v1/procurement/purchase-orders/:id` | Update purchase order | Private |
| DELETE | `/api/v1/procurement/purchase-orders/:id` | Delete purchase order | Private |
| POST | `/api/v1/procurement/purchase-orders/:id/approve` | Approve purchase order | Manager+ |
| POST | `/api/v1/procurement/purchase-orders/:id/reject` | Reject purchase order | Manager+ |
| POST | `/api/v1/procurement/purchase-orders/:id/submit` | Submit for approval | Private |
| GET | `/api/v1/procurement/analytics/dashboard` | Procurement analytics | Manager+ |

### Vendors

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/v1/vendors` | Get vendors | Private |
| POST | `/api/v1/vendors` | Create vendor | Manager+ |
| GET | `/api/v1/vendors/:id` | Get vendor | Private |
| PUT | `/api/v1/vendors/:id` | Update vendor | Manager+ |
| DELETE | `/api/v1/vendors/:id` | Delete vendor | Admin |
| POST | `/api/v1/vendors/:id/approve` | Approve vendor | Manager+ |
| POST | `/api/v1/vendors/:id/blacklist` | Blacklist vendor | Manager+ |
| GET | `/api/v1/vendors/:id/performance` | Vendor performance | Manager+ |

### Logistics

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/v1/logistics/shipments` | Get shipments | Private |
| POST | `/api/v1/logistics/shipments` | Create shipment | Manager+ |
| GET | `/api/v1/logistics/shipments/:id` | Get shipment | Private |
| PUT | `/api/v1/logistics/shipments/:id` | Update shipment | Manager+ |
| DELETE | `/api/v1/logistics/shipments/:id` | Delete shipment | Admin |
| POST | `/api/v1/logistics/shipments/:id/tracking-events` | Add tracking event | Manager+ |
| GET | `/api/v1/logistics/shipments/:id/tracking` | Get tracking info | Public |
| GET | `/api/v1/logistics/tracking/:trackingNumber` | Track by number | Public |
| GET | `/api/v1/logistics/analytics/dashboard` | Logistics analytics | Manager+ |
| GET | `/api/v1/logistics/reports/delivery-performance` | Delivery report | Manager+ |

### Inventory

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/v1/inventory` | Get inventory items | Private |
| POST | `/api/v1/inventory` | Create inventory item | Manager+ |
| GET | `/api/v1/inventory/:id` | Get inventory item | Private |
| PUT | `/api/v1/inventory/:id` | Update inventory item | Manager+ |
| DELETE | `/api/v1/inventory/:id` | Delete inventory item | Admin |
| POST | `/api/v1/inventory/:id/stock-movement` | Add stock movement | Manager+ |
| GET | `/api/v1/inventory/low-stock` | Get low stock items | Private |
| POST | `/api/v1/inventory/:id/cycle-count` | Perform cycle count | Manager+ |
| GET | `/api/v1/inventory/analytics/dashboard` | Inventory analytics | Manager+ |

## 🔐 Authentication

### User Roles

- **user**: Basic access to own records
- **procurement_manager**: Procurement operations management
- **logistics_manager**: Logistics operations management  
- **admin**: Full system access

### JWT Token

Include the JWT token in the Authorization header:

```http
Authorization: Bearer your_jwt_token_here
```

### Example Authentication Flow

```javascript
// 1. Register user
const registerResponse = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    department: 'procurement'
  })
});

// 2. Login
const loginResponse = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
  })
});

const { token } = await loginResponse.json();

// 3. Use token for authenticated requests
const dataResponse = await fetch('/api/v1/procurement/purchase-orders', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 📊 Data Models

### Purchase Order

```javascript
{
  "poNumber": "PO-1634567890123",
  "vendor": "vendor_id",
  "status": "pending_approval",
  "priority": "medium",
  "department": "operations",
  "lineItems": [
    {
      "itemId": "ITEM-001",
      "description": "Office Supplies",
      "quantity": 10,
      "unitPrice": 25.99,
      "totalPrice": 259.90,
      "category": "supplies"
    }
  ],
  "totalAmount": 259.90,
  "expectedDeliveryDate": "2024-01-15T00:00:00.000Z"
}
```

### Vendor

```javascript
{
  "vendorId": "VND-1634567890123",
  "name": "Acme Supplies Inc",
  "category": "materials",
  "status": "active",
  "rating": 4.2,
  "contacts": [
    {
      "name": "Jane Smith",
      "email": "jane@acme.com",
      "phone": "+1-555-0123",
      "position": "Sales Manager",
      "isPrimary": true
    }
  ],
  "paymentTerms": "NET30"
}
```

### Shipment

```javascript
{
  "shipmentId": "SHP-1634567890123",
  "trackingNumber": "1Z999AA1234567890",
  "status": "in_transit",
  "carrier": {
    "name": "FedEx",
    "service": "Ground"
  },
  "origin": {
    "address": {
      "city": "Los Angeles",
      "state": "CA",
      "country": "USA"
    }
  },
  "destination": {
    "address": {
      "city": "New York",
      "state": "NY", 
      "country": "USA"
    }
  },
  "trackingEvents": [
    {
      "status": "picked_up",
      "location": { "city": "Los Angeles", "state": "CA" },
      "timestamp": "2024-01-10T10:00:00.000Z"
    }
  ]
}
```

## 💡 Usage Examples

### Creating a Purchase Order

```javascript
const createPO = async () => {
  const response = await fetch('/api/v1/procurement/purchase-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      vendor: "vendor_id_here",
      department: "operations",
      priority: "high",
      lineItems: [
        {
          itemId: "LAPTOP-001",
          description: "Dell Laptop",
          quantity: 2,
          unitPrice: 899.99,
          category: "equipment"
        }
      ],
      deliveryAddress: {
        street: "123 Main St",
        city: "Anytown",
        state: "CA",
        zipCode: "12345",
        country: "USA"
      },
      expectedDeliveryDate: "2024-02-01"
    })
  });
  
  const result = await response.json();
  console.log('Purchase Order Created:', result.data);
};
```

### Tracking a Shipment

```javascript
const trackShipment = async (trackingNumber) => {
  const response = await fetch(`/api/v1/logistics/tracking/${trackingNumber}`);
  const result = await response.json();
  
  if (result.success) {
    console.log('Shipment Status:', result.data.status);
    console.log('Latest Event:', result.data.trackingEvents.slice(-1)[0]);
  }
};
```

### Managing Inventory

```javascript
const addInventoryItem = async () => {
  const response = await fetch('/api/v1/inventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      sku: "WIDGET-001",
      name: "Industrial Widget",
      category: "raw_materials",
      unitOfMeasure: "each",
      location: {
        warehouse: "WH-001",
        aisle: "A1",
        shelf: "S3"
      },
      cost: {
        unit: 12.50
      },
      reorderPoint: 50,
      reorderQuantity: 200,
      supplier: "vendor_id_here"
    })
  });
  
  const result = await response.json();
  console.log('Inventory Item Created:', result.data);
};
```

## 🔗 N8N Integration

This API is designed for seamless integration with N8N workflows. Here are common integration patterns:

### Purchase Order Approval Workflow

```json
{
  "name": "PO Approval Workflow",
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "po-submitted"
      }
    },
    {
      "name": "Get PO Details",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{$node['Webhook Trigger'].json.poId}}",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer {{$credentials.apiToken}}"
        }
      }
    },
    {
      "name": "Send Approval Email",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "toEmail": "manager@company.com",
        "subject": "PO Approval Required: {{$node['Get PO Details'].json.data.poNumber}}"
      }
    }
  ]
}
```

### Inventory Monitoring

```json
{
  "name": "Low Stock Alert",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.cron",
      "parameters": {
        "rule": "0 9 * * 1-5"
      }
    },
    {
      "name": "Check Low Stock",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:3000/api/v1/inventory/low-stock",
        "method": "GET"
      }
    },
    {
      "name": "Send Alert",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#procurement",
        "text": "Low stock items found: {{$node['Check Low Stock'].json.count}} items need reordering"
      }
    }
  ]
}
```

## 🚧 Development

### Project Structure

```
├── config/
│   └── logger.js          # Winston logger configuration
├── middleware/
│   ├── auth.js            # Authentication middleware
│   └── errorHandler.js    # Error handling middleware
├── models/
│   ├── User.js            # User model
│   ├── Vendor.js          # Vendor model
│   ├── PurchaseOrder.js   # Purchase order model
│   ├── Shipment.js        # Shipment model
│   └── Inventory.js       # Inventory model
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── procurement.js     # Procurement routes
│   ├── vendors.js         # Vendor routes
│   ├── logistics.js       # Logistics routes
│   └── inventory.js       # Inventory routes
├── logs/                  # Log files
├── server.js              # Main server file
└── package.json           # Dependencies and scripts
```

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Start production server
npm start

# Run tests
npm test

# Install dependencies
npm install
```

### Adding New Features

1. Create new model in `models/` directory
2. Add routes in `routes/` directory
3. Update server.js to include new routes
4. Add proper validation and error handling
5. Update this README with new endpoints

## 📝 API Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": { /* response data */ },
  "count": 10,           // For list endpoints
  "pagination": {        // For paginated endpoints
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "errors": [            // For validation errors
    {
      "field": "email",
      "message": "Please include a valid email"
    }
  ]
}
```

## 🐛 Error Handling

The API implements comprehensive error handling:

- **Validation Errors**: 400 Bad Request
- **Authentication Errors**: 401 Unauthorized  
- **Authorization Errors**: 403 Forbidden
- **Not Found Errors**: 404 Not Found
- **Server Errors**: 500 Internal Server Error

All errors are logged with appropriate detail levels for debugging and monitoring.

## 📊 Monitoring & Logging

- **Winston Logging**: Structured logging with configurable levels
- **Morgan HTTP Logging**: HTTP request/response logging
- **Error Tracking**: Centralized error handling and logging
- **Performance Monitoring**: Built-in request timing and metrics

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Configurable rate limiting per IP
- **Helmet Security**: Security headers with Helmet.js
- **Input Validation**: Comprehensive input validation
- **CORS Support**: Configurable CORS settings
- **Environment Configuration**: Secure environment variable management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the GitHub repository
- Contact the development team
- Check the API documentation

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup

Ensure all environment variables are properly configured for your deployment environment. Use secrets management for sensitive values in production.

---

**Happy coding! 🎉**