import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'betNANDO API',
      version,
      description: 'Virtual football betting platform API for friend groups',
    },
    servers: [{ url: '/api', description: 'API server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            balance: { type: 'number' },
            role: { type: 'string', enum: ['USER', 'ADMIN'] },
          },
        },
        Match: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            externalId: { type: 'string' },
            homeTeamId: { type: 'string' },
            awayTeamId: { type: 'string' },
            competitionId: { type: 'string' },
            matchday: { type: 'integer' },
            matchDate: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED'] },
            previousStatus: { type: 'string', nullable: true },
            homeScore: { type: 'integer', nullable: true },
            awayScore: { type: 'integer', nullable: true },
            halfTimeHome: { type: 'integer', nullable: true },
            halfTimeAway: { type: 'integer', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
            // Computed fields for frontend compatibility
            homeTeam: { type: 'string' },
            awayTeam: { type: 'string' },
            homeCrest: { type: 'string', nullable: true },
            awayCrest: { type: 'string', nullable: true },
            league: { type: 'string' },
            competition: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                logoUrl: { type: 'string', nullable: true },
                active: { type: 'boolean' },
              },
            },
          },
        },
        Bet: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            stake: { type: 'number' },
            totalOdds: { type: 'number' },
            potentialReturn: { type: 'number' },
            status: { type: 'string', enum: ['PENDING', 'WON', 'LOST', 'CANCELLED'] },
            selections: {
              type: 'array',
              items: { $ref: '#/components/schemas/BetSelection' },
            },
          },
        },
        BetSelection: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            matchId: { type: 'string' },
            market: { type: 'string' },
            selection: { type: 'string' },
            odds: { type: 'number' },
            won: { type: 'boolean', nullable: true },
          },
        },
        PaginatedBets: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Bet' } },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);