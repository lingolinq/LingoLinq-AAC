require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "protected image use" do
    it "should correctly mark a board as protected" do
      token_user
      post :create, params: {"board":
        {"name": "lptest","key": nil,"description": nil,"created": nil,"updated": nil,"user_name": nil,"locale": "en_US","full_set_revision": nil,"current_revision": nil,"for_user_id": "self","parent_board_id": nil,"parent_board_key": nil,"link": nil,"image_url": nil,"grid": {"rows": 2,"columns": 4},"license": {"type": "private"},"copies": nil,"word_suggestions": false,"public": true,"brand_new": false,"protected": false,"non_author_uses": nil,"downstream_boards": nil,"immediately_upstream_boards": nil,"unlinked_buttons": nil,"forks": nil,"total_buttons": nil,"sharing_key": nil,"starred": false,"stars": nil,"non_author_starred": false,"retrieved": nil,"images": []}
      }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('lptest')
      expect(json['board']['public']).to eq(true)
      b = Board.find_by_path(json['board']['id'])
      expect(b).to_not eq(nil)
      Worker.process_queues

      bi1 = ButtonImage.process_new({"url": "http://localhost:3000/api/v1/users/1_1/protected_image/lessonpix/30983","content_type": nil,"width": nil,"height": nil,"pending": false,"avatar": false,"badge": false,"protected": true,"suggestion": "cat","external_id": nil,"search_term": nil,"license": {"type": "private","source_url": "https://lessonpix.com/pictures/30983/cat","author_name": "LessonPix","author_url": "https://lessonpix.com","uneditable": true},"file": false,"retrieved": nil}, {:user => @user, :remote_upload_possible => true})
      expect(bi1.protected?).to eq(true)
      bi2 = ButtonImage.create(:settings => {'protected' => true})
      bi3 = ButtonImage.create(:settings => {'protected' => false})
      Worker.process_queues
      put :update, params: {:id => b.global_id, "board":{"name": "lptest","key": "example/lptest_2","description": nil,"created": "2017-02-24T20:12:01.000Z","updated": "2017-02-24T20:12:01.000Z","user_name": "example","locale": "en_US","full_set_revision": "0b5d2fa3a4f31f42301f34fa6e288f97","current_revision": "0b5d2fa3a4f31f42301f34fa6e288f97","for_user_id": "self","parent_board_id": nil,"parent_board_key": nil,"link": "http://localhost:3000/example/lptest_2","image_url": "https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png","buttons": [{"label": "cat","image_id": bi1.global_id,"background_color": "rgb(255, 204, 170)","border_color": "rgb(255, 112, 17)","hidden": false,"link_disabled": false,"add_to_vocalization": false,"home_lock": false,"blocking_speech": false,"part_of_speech": "noun","suggested_part_of_speech": "noun","id": 1,"dark_border_color": "rgb(246, 98, 0)","dark_background_color": "rgb(255, 189, 144)","text_color": "rgb(0, 0, 0)"}],"grid": {"rows": 2,"columns": 4,"order": [[1,nil,nil,nil],[nil,nil,nil,nil]]},"license": {"type": "private"},"permissions": {"user_id": "1_1","view": true,"edit": true,"delete": true,"share": true},"copies": 0,"word_suggestions": false,"public": true,"brand_new": false,"protected": false,"non_author_uses": 0,"downstream_boards": 0,"immediately_upstream_boards": 0,"unlinked_buttons": 0,"forks": 0,"total_buttons": 0,"shared_users": [],"sharing_key": nil,"starred": false,"stars": 0,"non_author_starred": false,"retrieved": 1487967122808,"images": []}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(true)
      expect(json['board']['public']).to eq(true)

      b.reload
      b.settings['protected']['vocabulary'] = true
      b.save

      put :update, params: {:id => b.global_id, :board => {
        'public' => true,
        'buttons' => [
          {'id' => 1, 'image_id' => bi1.global_id, 'label' => 'a'},
          {'id' => 2, 'image_id' => bi2.global_id, 'label' => 'b'}
        ],
        'grid' => {
          rows: 2,
          columns: 4,
          order: [
            [1, 2, nil, nil],
            [nil, nil, nil, nil]
          ]
        }
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(true)
      expect(json['board']['public']).to eq(false)

      b.reload
      b.settings['protected'].delete('vocabulary')
      b.save

      put :update, params: {:id => b.global_id, :board => {
        'public' => true,
        'buttons' => [
          {'id' => 1, 'image_id' => bi3.global_id, 'label' => 'a'}
        ],
        'grid' => {
          rows: 2,
          columns: 4,
          order: [
            [1, nil, nil, nil],
            [nil, nil, nil, nil]
          ]
        }
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(false)
      expect(json['board']['public']).to eq(true)
    end
  end
end