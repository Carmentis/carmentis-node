import { Controller, Get, OnModuleInit } from '@nestjs/common';

@Controller()
export class RestAbciQueryController  {

    @Get('/hello')
    async hello() {
        return { hello: 'hello' };
    }
}