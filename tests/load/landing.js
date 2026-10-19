import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '30s', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};

export default function () {
  const response = http.get(__ENV.BASE_URL || 'http://127.0.0.1:3000/');
  check(response, { 'landing responds': (r) => r.status >= 200 && r.status < 400 });
}
