import { describe, it, expect } from '@jest/globals';
import {
  parseHostname,
  isLoopbackHost,
  getAllowedHostnames,
  getRequestRejection,
} from '../lib/host-validation.js';

describe('parseHostname', () => {
  it('should strip the port and lowercase the name', () => {
    expect(parseHostname('LocalHost:3001')).toBe('localhost');
    expect(parseHostname('127.0.0.1:3001')).toBe('127.0.0.1');
    expect(parseHostname('example.com')).toBe('example.com');
  });

  it('should keep IPv6 addresses in brackets', () => {
    expect(parseHostname('[::1]:3001')).toBe('[::1]');
    expect(parseHostname('[::1]')).toBe('[::1]');
    expect(parseHostname('::1')).toBe('[::1]');
  });

  it('should return undefined for empty or malformed values', () => {
    expect(parseHostname('')).toBeUndefined();
    expect(parseHostname('   ')).toBeUndefined();
    expect(parseHostname('[::1')).toBeUndefined();
  });
});

describe('isLoopbackHost', () => {
  it('should recognize loopback addresses', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.2')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
  });

  it('should treat other addresses as reachable from the network', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('::')).toBe(false);
    expect(isLoopbackHost('192.168.1.10')).toBe(false);
  });
});

describe('getAllowedHostnames', () => {
  it('should allow only the loopback names by default', () => {
    const allowed = getAllowedHostnames('127.0.0.1', undefined);
    expect([...allowed].sort()).toEqual(['127.0.0.1', '[::1]', 'localhost'].sort());
  });

  it('should add the listen address unless it is a wildcard', () => {
    expect(getAllowedHostnames('192.168.1.10', undefined).has('192.168.1.10')).toBe(true);
    expect(getAllowedHostnames('0.0.0.0', undefined).has('0.0.0.0')).toBe(false);
    expect(getAllowedHostnames('::', undefined).has('[::]')).toBe(false);
  });

  it('should add comma-separated extra hosts, ignoring ports and blanks', () => {
    const allowed = getAllowedHostnames('127.0.0.1', ' my-box.local:3001, ,Dev.Example ');
    expect(allowed.has('my-box.local')).toBe(true);
    expect(allowed.has('dev.example')).toBe(true);
    expect(allowed.size).toBe(5);
  });
});

describe('getRequestRejection', () => {
  const allowed = getAllowedHostnames('127.0.0.1', undefined);

  it('should accept loopback hosts without an Origin header', () => {
    expect(getRequestRejection('localhost:3001', undefined, allowed)).toBeUndefined();
    expect(getRequestRejection('127.0.0.1:3001', undefined, allowed)).toBeUndefined();
    expect(getRequestRejection('[::1]:3001', undefined, allowed)).toBeUndefined();
  });

  it('should accept loopback origins', () => {
    expect(getRequestRejection('localhost:3001', 'http://localhost:6274', allowed)).toBeUndefined();
    expect(getRequestRejection('localhost:3001', 'http://[::1]:3001', allowed)).toBeUndefined();
  });

  it('should reject other or missing hosts', () => {
    expect(getRequestRejection('evil.example:3001', undefined, allowed)).toContain(
      'Host "evil.example:3001" is not allowed'
    );
    expect(getRequestRejection(undefined, undefined, allowed)).toContain('is not allowed');
  });

  it('should reject other origins, including "null"', () => {
    expect(getRequestRejection('localhost:3001', 'https://evil.example', allowed)).toContain(
      'Origin "https://evil.example" is not allowed'
    );
    expect(getRequestRejection('localhost:3001', 'null', allowed)).toContain(
      'Origin "null" is not allowed'
    );
  });
});
