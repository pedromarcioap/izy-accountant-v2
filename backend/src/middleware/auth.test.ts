import { Request, Response, NextFunction } from 'express';
import { authenticateToken } from './auth';
import jwt from 'jsonwebtoken';

describe('authenticateToken', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction = jest.fn();

    beforeEach(() => {
        mockRequest = {};
        mockResponse = {
            sendStatus: jest.fn(),
        };
    });

    it('should return 401 if no token is provided', () => {
        mockRequest = {
            headers: {
                authorization: '',
            },
        };
        authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(mockResponse.sendStatus).toHaveBeenCalledWith(401);
    });

    it('should return 403 if token is invalid', () => {
        mockRequest = {
            headers: {
                authorization: 'Bearer invalidtoken',
            },
        };
        authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(mockResponse.sendStatus).toHaveBeenCalledWith(403);
    });

    it('should call next if token is valid', () => {
        const token = jwt.sign({ username: 'testuser' }, process.env.JWT_SECRET || 'your_jwt_secret');
        mockRequest = {
            headers: {
                authorization: `Bearer ${token}`,
            },
        };
        authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
    });
});
