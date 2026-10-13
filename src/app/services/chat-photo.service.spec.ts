import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChatPhotoService } from './chat-photo.service';
import { environment } from '../../environments/environment';

describe('ChatPhotoService', () => {
  let service: ChatPhotoService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/chat-service/conversations/c1/photos`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ChatPhotoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('send_shouldPostTheFileAndTheCaption_asMultipart', () => {
    service.send('c1', new Blob(['jpeg'], { type: 'image/jpeg' }), '  Le podium ').subscribe();

    const call = httpMock.expectOne(url);
    expect(call.request.method).toBe('POST');
    const form = call.request.body as FormData;
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.get('caption')).toBe('Le podium');
    call.flush({});
  });

  it('send_shouldLeaveOutAnEmptyCaption', () => {
    service.send('c1', new Blob(['jpeg'])).subscribe();

    const call = httpMock.expectOne(url);
    expect((call.request.body as FormData).has('caption')).toBe(false);
    call.flush({});
  });

  it('page_shouldStartFromTheNewest_thenContinueBeforeTheLast', () => {
    service.page('c1').subscribe();
    expect(httpMock.expectOne(url).request.params.has('before')).toBe(false);

    service.page('c1', '2026-10-13T20:00:00Z').subscribe();
    const next = httpMock.expectOne(request => request.url === url);
    expect(next.request.params.get('before')).toBe('2026-10-13T20:00:00Z');
  });

  it('remove_shouldDeleteThePhotoOfTheMessage', () => {
    service.remove('c1', 'm1').subscribe();

    const call = httpMock.expectOne(`${url}/m1`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null);
  });
});
