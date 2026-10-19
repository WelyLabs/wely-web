import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommunityService } from './community.service';
import { environment } from '../../environments/environment';

describe('CommunityService', () => {
  let service: CommunityService;
  let http: HttpTestingController;
  const api = `${environment.apiUrl}/social-service/communities`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(CommunityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('discovers without filters', () => {
    service.discover().subscribe();
    const req = http.expectOne((r) => r.url === api);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('discovers with a trimmed query and an interest', () => {
    service.discover('  auto ', 'balades').subscribe();
    const req = http.expectOne((r) => r.url === api);
    expect(req.request.params.get('q')).toBe('auto');
    expect(req.request.params.get('interest')).toBe('balades');
    req.flush([]);
  });

  it('ignores a blank query', () => {
    service.discover('   ').subscribe();
    const req = http.expectOne((r) => r.url === api);
    expect(req.request.params.has('q')).toBe(false);
    req.flush([]);
  });

  it.each([
    ['mine', () => service.mine(), 'GET', `${api}/mine`, null],
    ['get', () => service.get('c1'), 'GET', `${api}/c1`, null],
    ['create', () => service.create({ name: 'Club', interests: [], visibility: 'PUBLIC' }), 'POST', api,
      { name: 'Club', interests: [], visibility: 'PUBLIC' }],
    ['update', () => service.update('c1', { name: 'Club', interests: [], visibility: 'PRIVATE' }), 'PUT', `${api}/c1`,
      { name: 'Club', interests: [], visibility: 'PRIVATE' }],
    ['delete', () => service.delete('c1'), 'DELETE', `${api}/c1`, null],
    ['join', () => service.join('c1'), 'POST', `${api}/c1/join`, {}],
    ['leave', () => service.leave('c1'), 'POST', `${api}/c1/leave`, { deleteIfLast: false }],
    ['leave and delete', () => service.leave('c1', true), 'POST', `${api}/c1/leave`, { deleteIfLast: true }],
    ['members', () => service.members('c1'), 'GET', `${api}/c1/members`, null],
    ['changeRole', () => service.changeRole('c1', 'u', 'ADMIN'), 'PUT', `${api}/c1/members/u/role`, { role: 'ADMIN' }],
    ['removeMember', () => service.removeMember('c1', 'u'), 'DELETE', `${api}/c1/members/u`, null],
    ['invite', () => service.invite('c1', 'u'), 'POST', `${api}/c1/invitations`, { inviteeId: 'u' }],
    ['invitations', () => service.invitations('c1'), 'GET', `${api}/c1/invitations`, null],
    ['revoke', () => service.revoke('c1', 'tok'), 'DELETE', `${api}/c1/invitations/tok`, null],
    ['invitation', () => service.invitation('tok'), 'GET', `${api}/invitations/tok`, null],
    ['accept', () => service.accept('tok'), 'POST', `${api}/invitations/tok/accept`, {}],
    ['removePicture', () => service.removePicture('c1'), 'DELETE', `${api}/c1/picture`, null],
  ])('%s calls the right endpoint', (_name, call, method, url, body) => {
    (call() as Observable<unknown>).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe(method);
    if (body !== null) {
      expect(req.request.body).toEqual(body);
    }
    req.flush(null);
  });

  it('uploads the picture as the multipart part « file »', () => {
    const picture = new Blob(['jpeg'], { type: 'image/jpeg' });

    service.uploadPicture('c1', picture).subscribe();

    const req = http.expectOne(`${api}/c1/picture`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(Blob);
    expect((body.get('file') as File).name).toBe('picture.jpg');
    req.flush(null);
  });
});
